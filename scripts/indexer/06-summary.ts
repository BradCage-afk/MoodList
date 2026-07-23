// Step 1.7 — index summary: totals, auto vs escalated split, distributions,
// and anything that failed. Safe to run at any point.
import "./env";
import { migrate, pool, closePool } from "./db";

async function main() {

  await migrate();

  const one = async (sql: string) => (await pool.query(sql)).rows;
  const [{ total }] = await one(`SELECT count(*)::int AS total FROM tracks`);
  const statuses = await one(`SELECT status, count(*)::int AS n FROM tracks GROUP BY status ORDER BY n DESC`);
  const srcStatus = await one(`SELECT confidence_source, count(*)::int AS n FROM tracks GROUP BY confidence_source ORDER BY n DESC`);
  const langs = await one(`SELECT coalesce(language, '(none)') AS v, count(*)::int AS n FROM tracks WHERE status = 'tagged' GROUP BY 1 ORDER BY n DESC`);
  const genres = await one(`SELECT coalesce(genre_family, '(none)') AS v, count(*)::int AS n FROM tracks WHERE status = 'tagged' GROUP BY 1 ORDER BY n DESC LIMIT 20`);
  const inst = await one(`SELECT instrumental, count(*)::int AS n FROM tracks WHERE status = 'tagged' GROUP BY 1`);
  const failedSources = await one(`SELECT query, error FROM sources WHERE error IS NOT NULL`);
  const srcProgress = await one(`SELECT status, count(*)::int AS n FROM sources GROUP BY status ORDER BY n DESC`);

  console.log(`=== Moodlist index summary ===`);
  console.log(`Tracks total: ${total}`);
  console.log(`Track status: ${statuses.map((r) => `${r.status}=${r.n}`).join("  ")}`);
  console.log(`Tag origin:   ${srcStatus.map((r) => `${r.confidence_source}=${r.n}`).join("  ")}`);
  console.log(`Sources:      ${srcProgress.map((r) => `${r.status}=${r.n}`).join("  ")}`);
  console.log(`\nLanguages (tagged tracks):`);
  for (const r of langs) console.log(`  ${r.v.padEnd(12)} ${r.n}`);
  console.log(`\nTop genres:`);
  for (const r of genres) console.log(`  ${r.v.padEnd(14)} ${r.n}`);
  console.log(`\nInstrumental: ${inst.map((r) => `${r.instrumental}=${r.n}`).join("  ")}`);
  if (failedSources.length) {
    console.log(`\nSources with errors (${failedSources.length}):`);
    for (const r of failedSources) console.log(`  "${r.query}": ${r.error?.slice(0, 100)}`);
  }
  await closePool();

}

main().catch((err) => { console.error(err); process.exit(1); });
