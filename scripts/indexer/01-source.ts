// Step 1.1 — register the virtual-playlist source matrix in the DB.
// Idempotent: re-running inserts new queries and leaves existing rows
// (and their progress) untouched.
import "./env";
import { migrate, pool, closePool } from "./db";
import { SOURCE_DEFS } from "./queries";

async function main() {

  await migrate();

  let inserted = 0;
  for (const def of SOURCE_DEFS) {
    const res = await pool.query(
      `INSERT INTO sources (query, markets, category, hints)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (query) DO NOTHING`,
      [def.query, def.markets, def.category, JSON.stringify(def.hints)]
    );
    inserted += res.rowCount ?? 0;
  }

  const { rows } = await pool.query(
    `SELECT category, count(*)::int AS n FROM sources GROUP BY category ORDER BY n DESC`
  );
  console.log(`Sources registered: +${inserted} new, ${SOURCE_DEFS.length} defined.`);
  for (const r of rows) console.log(`  ${r.category}: ${r.n}`);
  await closePool();

}

main().catch((err) => { console.error(err); process.exit(1); });
