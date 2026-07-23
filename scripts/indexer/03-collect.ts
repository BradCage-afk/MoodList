// Step 1.3 — collect tracks for every approved source via search fan-out
// (the 2026 API caps search at 10/request; offsets verified deep past 490).
// Checkpointed per source: a finished source is marked 'collected' and
// skipped on re-run; an interrupted one redoes only its own upserts.
//
//   npx tsx scripts/indexer/03-collect.ts --pages=20      # full depth (default)
//   npx tsx scripts/indexer/03-collect.ts --pages=3 --limit=8   # sample run
import "./env";
import { migrate, pool, closePool } from "./db";
import { searchTracks } from "./spotify";

async function main() {

  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const m = a.match(/^--([a-z]+)(?:=(.*))?$/);
      return m ? [m[1], m[2] ?? "true"] : [a, "true"];
    })
  );
  const PAGES = Number(args.pages ?? 20);
  const LIMIT = args.limit ? Number(args.limit) : null;

  const JUNK_TITLE = /nonstop|non stop|mashup|medley|megamix|jukebox|mixtape|dj mix|8d audio|sped up|slowed.*reverb|reverb.*slowed|karaoke|tribute|cover version|lullaby version|workout remix/i;

  await migrate();

  const { rows: sources } = await pool.query(
    `SELECT id, query, markets FROM sources WHERE status = 'approved' ORDER BY id ${LIMIT ? `LIMIT ${LIMIT}` : ""}`
  );
  console.log(`Collecting ${sources.length} sources × ${PAGES} pages/market...`);

  let totalNew = 0;
  for (const [i, src] of sources.entries()) {
    try {
      const seen = new Map<string, number>(); // track id → best rank within this source
      for (const market of src.markets) {
        for (let page = 0; page < PAGES; page++) {
          const items = await searchTracks(src.query, market, page * 10);
          for (const [j, t] of items.entries()) {
            if (JUNK_TITLE.test(t.name)) continue;
            const rank = page * 10 + j;
            if (!seen.has(t.id) || rank < seen.get(t.id)!) seen.set(t.id, rank);
            await pool.query(
              `INSERT INTO tracks (id, name, artists, album, album_art, release_date, duration_ms, explicit)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (id) DO NOTHING`,
              [
                t.id,
                t.name,
                JSON.stringify(t.artists.map((a) => ({ id: a.id, name: a.name }))),
                t.album?.name ?? null,
                t.album?.images?.[0]?.url ?? null,
                t.album?.release_date ?? null,
                t.duration_ms ?? null,
                t.explicit ?? null,
              ]
            );
          }
          if (items.length === 0) break; // ran out of results for this market
        }
      }
      for (const [trackId, rank] of seen) {
        await pool.query(
          `INSERT INTO track_sources (track_id, source_id, best_rank) VALUES ($1, $2, $3)
           ON CONFLICT (track_id, source_id) DO UPDATE SET best_rank = LEAST(track_sources.best_rank, $3)`,
          [trackId, src.id, rank]
        );
      }
      await pool.query(`UPDATE sources SET status = 'collected', tracks_found = $1, error = NULL WHERE id = $2`, [
        seen.size,
        src.id,
      ]);
      totalNew += seen.size;
      console.log(`  [${i + 1}/${sources.length}] "${src.query}" → ${seen.size} tracks`);
    } catch (err) {
      await pool.query(`UPDATE sources SET error = $1 WHERE id = $2`, [String(err).slice(0, 300), src.id]);
      console.error(`  FAILED "${src.query}": ${String(err).slice(0, 150)}`);
    }
  }

  const { rows: [{ n }] } = await pool.query(`SELECT count(*)::int AS n FROM tracks`);
  console.log(`Done. ${totalNew} memberships this run; ${n} unique tracks in index.`);
  await closePool();

}

main().catch((err) => { console.error(err); process.exit(1); });
