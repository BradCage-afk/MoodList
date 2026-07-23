// Step 1.5 — LLM escalation for low-confidence tracks only. Each escalated
// track gets one Haiku-class call (GLM 5.2 on NIM) with its source
// memberships, metadata, and — when findable — lyrics fetched via
// Genius/lrclib. Lyrics are used in the prompt and discarded immediately;
// they are never stored or logged. Checkpointed per track.
//
//   npx tsx scripts/indexer/05-escalate.ts [--limit=N] [--no-lyrics]
import "./env";
import { migrate, pool, closePool } from "./db";
import { llmJson } from "./llm";
import { sanitizeTags, LANGUAGES, GENRE_FAMILIES, CONTEXT_TAGS } from "./tagSchema";
import { getLyricsForScoring } from "../../lib/genius";

async function main() {

  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const m = a.match(/^--([a-z-]+)(?:=(.*))?$/);
      return m ? [m[1], m[2] ?? "true"] : [a, "true"];
    })
  );
  const LIMIT = args.limit ? Number(args.limit) : null;
  const USE_LYRICS = !args["no-lyrics"];

  await migrate();

  const { rows } = await pool.query(`
    SELECT t.id, t.name, t.artists, t.album, t.release_date, t.duration_ms,
           jsonb_agg(jsonb_build_object('query', s.query, 'tags', s.tags)) AS memberships
    FROM tracks t
    JOIN track_sources ts ON ts.track_id = t.id
    JOIN sources s ON s.id = ts.source_id AND s.tags IS NOT NULL
    WHERE t.status = 'needs_escalation'
    GROUP BY t.id
    ORDER BY t.id
    ${LIMIT ? `LIMIT ${LIMIT}` : ""}
  `);
  console.log(`Escalating ${rows.length} tracks (lyrics: ${USE_LYRICS ? "on" : "off"})...`);

  const system = `You classify songs into structured tags for a mood-playlist index. You will get a song's
  metadata, the search queries that surfaced it (with those queries' own tags as weak hints), and
  sometimes its lyrics. Use your own knowledge of the song and artist when you recognize them —
  that outranks the query hints. Lyrics, when present, are the strongest signal for valence/language.
  Respond with ONLY a JSON object of exactly this shape (null only when truly undeterminable):
  {
    "language": one of ${JSON.stringify(LANGUAGES)} or null (instrumental tracks: null),
    "genre_family": one of ${JSON.stringify(GENRE_FAMILIES)} or null,
    "energy": "high" | "medium" | "low",
    "valence": "positive" | "negative" | "neutral",
    "instrumental": true | false,
    "context_tags": array (possibly empty) drawn only from ${JSON.stringify(CONTEXT_TAGS)}
  }`;

  let done = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const artists = (row.artists as { name: string }[]).map((a) => a.name);
      let lyricsBlock = "";
      if (USE_LYRICS) {
        const signal = AbortSignal.timeout(8000);
        const lyrics = await getLyricsForScoring(row.name, artists[0] ?? "", signal).catch(() => null);
        if (lyrics) lyricsBlock = `\nLyrics (excerpt):\n${lyrics.slice(0, 1500)}`;
        // lyrics variable goes out of scope here — never persisted anywhere
      }
      const memberships = (row.memberships as { query: string; tags: unknown }[])
        .map((m) => `- "${m.query}" → ${JSON.stringify(m.tags)}`)
        .join("\n");
      const raw = await llmJson(
        system,
        `Song: "${row.name}" by ${artists.join(", ")}\nAlbum: ${row.album ?? "?"} (${row.release_date ?? "?"})` +
          `\nDuration: ${Math.round((row.duration_ms ?? 0) / 1000)}s` +
          `\nSurfaced by queries:\n${memberships}${lyricsBlock}`
      );
      const tags = sanitizeTags(raw);
      await pool.query(
        `UPDATE tracks SET
           language = $1, genre_family = $2, energy = $3, valence = $4,
           instrumental = $5, context_tags = $6,
           confidence = GREATEST(coalesce(confidence, 0), 0.6),
           confidence_source = 'llm_escalated', status = 'tagged'
         WHERE id = $7`,
        [tags.language, tags.genre_family, tags.energy, tags.valence, tags.instrumental, tags.context_tags, row.id]
      );
      done++;
      if (done % 25 === 0) console.log(`  ${done}/${rows.length}`);
    } catch (err) {
      failed++;
      await pool.query(`UPDATE tracks SET status = 'failed', confidence_source = 'failed' WHERE id = $1`, [row.id]);
      console.error(`  FAILED "${row.name}": ${String(err).slice(0, 120)}`);
    }
  }
  console.log(`Escalation done: ${done} tagged, ${failed} failed.`);
  await closePool();

}

main().catch((err) => { console.error(err); process.exit(1); });
