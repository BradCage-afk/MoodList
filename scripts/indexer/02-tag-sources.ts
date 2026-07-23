// Step 1.2 — normalize each source query (+ authored hints) into the shared
// tag schema with one LLM call per source, then print the full map for human
// review. Collection (step 03) only touches sources approved via --approve.
//
//   npx tsx scripts/indexer/02-tag-sources.ts            # tag untagged sources
//   npx tsx scripts/indexer/02-tag-sources.ts --review   # print current map only
//   npx tsx scripts/indexer/02-tag-sources.ts --approve  # mark all tagged → approved
import "./env";
import { migrate, pool, closePool } from "./db";
import { llmJson } from "./llm";
import { sanitizeTags, LANGUAGES, GENRE_FAMILIES, CONTEXT_TAGS } from "./tagSchema";

async function main() {

  const mode = process.argv.includes("--approve")
    ? "approve"
    : process.argv.includes("--review")
      ? "review"
      : "tag";

  await migrate();

  if (mode === "approve") {
    const res = await pool.query(`UPDATE sources SET status = 'approved' WHERE status = 'tagged'`);
    console.log(`Approved ${res.rowCount} sources for collection.`);
    await printMap();
    await closePool();
    process.exit(0);
  }

  if (mode === "tag") {
    const limitArg = process.argv.find((a) => a.startsWith("--limit="));
    const limit = limitArg ? Number(limitArg.split("=")[1]) : null;
    const { rows } = await pool.query(
      `SELECT id, query, category, hints FROM sources WHERE status = 'sourced' ORDER BY id ${limit ? `LIMIT ${limit}` : ""}`
    );
    console.log(`Tagging ${rows.length} sources...`);

    const system = `You classify music search queries into structured tags for a playlist index.
  Respond with ONLY a JSON object of exactly this shape (null when the query does not imply a value):
  {
    "language": one of ${JSON.stringify(LANGUAGES)} or null,
    "genre_family": one of ${JSON.stringify(GENRE_FAMILIES)} or null,
    "energy": "high" | "medium" | "low" | null,
    "valence": "positive" | "negative" | "neutral" | null,
    "instrumental": true | false | null,
    "context_tags": array (possibly empty) drawn only from ${JSON.stringify(CONTEXT_TAGS)}
  }
  The "authored hints" you receive were written by the index curator — treat them as strong
  priors and only deviate when they are clearly wrong for the query text.`;

    let done = 0;
    for (const row of rows) {
      try {
        const raw = await llmJson(
          system,
          `Search query: "${row.query}" (category: ${row.category})\nAuthored hints: ${JSON.stringify(row.hints)}`
        );
        const tags = sanitizeTags(raw);
        await pool.query(`UPDATE sources SET tags = $1, status = 'tagged', error = NULL WHERE id = $2`, [
          JSON.stringify(tags),
          row.id,
        ]);
        done++;
        if (done % 20 === 0) console.log(`  ${done}/${rows.length}`);
      } catch (err) {
        await pool.query(`UPDATE sources SET error = $1 WHERE id = $2`, [String(err).slice(0, 300), row.id]);
        console.error(`  FAILED "${row.query}": ${String(err).slice(0, 120)}`);
      }
    }
    console.log(`Tagged ${done}/${rows.length}.`);
  }

  await printMap();
  console.log(
    `\nReview the map above (spot-check languages/genres especially). Then run:\n  npx tsx scripts/indexer/02-tag-sources.ts --approve`
  );
  await closePool();

  async function printMap() {
    const { rows } = await pool.query(
      `SELECT query, category, status, tags FROM sources WHERE tags IS NOT NULL ORDER BY category, query`
    );
    console.log(`\n=== Source → tag map (${rows.length} tagged) ===`);
    for (const r of rows) {
      const t = r.tags;
      const bits = [
        t.language ?? "-",
        t.genre_family ?? "-",
        `e:${t.energy ?? "-"}`,
        `v:${t.valence ?? "-"}`,
        t.instrumental === null ? "inst:-" : t.instrumental ? "INSTRUMENTAL" : "vocal",
        (t.context_tags ?? []).join("+") || "-",
      ].join(" | ");
      console.log(`[${r.status}] (${r.category}) "${r.query}" → ${bits}`);
    }
  }

}

main().catch((err) => { console.error(err); process.exit(1); });
