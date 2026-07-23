// Step 1.4 — rule-based confidence scoring, zero LLM calls. Each track
// aggregates the tag objects of every source (virtual playlist) that surfaced
// it: per-axis majority vote weighted by agreement × coverage, combined with
// the spec's axis weights. High-confidence tracks are tagged directly;
// the rest are marked for LLM escalation (step 05).
import "./env";
import { migrate, pool, closePool } from "./db";
import type { TagObject } from "./tagSchema";

async function main() {

  const THRESHOLD = 0.75;
  const WEIGHTS = { language: 0.3, genre_family: 0.25, valence: 0.2, energy: 0.15, context: 0.1 };

  await migrate();

  const { rows } = await pool.query(`
    SELECT t.id, jsonb_agg(s.tags) AS source_tags
    FROM tracks t
    JOIN track_sources ts ON ts.track_id = t.id
    JOIN sources s ON s.id = ts.source_id AND s.tags IS NOT NULL
    WHERE t.status IN ('collected', 'needs_escalation')
    GROUP BY t.id
  `);
  console.log(`Scoring ${rows.length} tracks...`);

  function majority(values: (string | boolean)[]): { value: string | boolean | null; agreement: number; votes: number } {
    if (values.length === 0) return { value: null, agreement: 0, votes: 0 };
    const counts = new Map<string, { v: string | boolean; n: number }>();
    for (const v of values) {
      const k = String(v);
      counts.set(k, { v, n: (counts.get(k)?.n ?? 0) + 1 });
    }
    const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
    return { value: best.v, agreement: best.n / values.length, votes: values.length };
  }

  let aggregated = 0;
  let escalate = 0;
  for (const row of rows) {
    const tags = row.source_tags as TagObject[];
    const n = tags.length;

    const axis = (key: "language" | "genre_family" | "energy" | "valence") => {
      const m = majority(tags.map((t) => t[key]).filter((v): v is string => v !== null));
      return { ...m, confidence: m.agreement * Math.min(m.votes / 3, 1) };
    };
    const lang = axis("language");
    const genre = axis("genre_family");
    const energy = axis("energy");
    const valence = axis("valence");
    const inst = majority(tags.map((t) => t.instrumental).filter((v): v is boolean => v !== null));

    // context: a tag is confirmed when present in ≥50% of the track's sources
    const tagCounts = new Map<string, number>();
    for (const t of tags) for (const c of t.context_tags ?? []) tagCounts.set(c, (tagCounts.get(c) ?? 0) + 1);
    const confirmed = [...tagCounts.entries()].filter(([, c]) => c / n >= 0.5).map(([tag]) => tag);
    const maxShare = tagCounts.size ? Math.max(...tagCounts.values()) / n : 0;
    const contextConf = maxShare * Math.min(n / 3, 1);

    const overall =
      WEIGHTS.language * lang.confidence +
      WEIGHTS.genre_family * genre.confidence +
      WEIGHTS.valence * valence.confidence +
      WEIGHTS.energy * energy.confidence +
      WEIGHTS.context * contextConf;

    const high = overall >= THRESHOLD;
    await pool.query(
      `UPDATE tracks SET
         language = $1, genre_family = $2, energy = $3, valence = $4,
         instrumental = $5, context_tags = $6, confidence = $7, axis_confidence = $8,
         confidence_source = $9, status = $10
       WHERE id = $11`,
      [
        lang.value,
        genre.value,
        energy.value,
        valence.value,
        inst.value,
        confirmed,
        overall,
        JSON.stringify({
          language: lang.confidence,
          genre_family: genre.confidence,
          energy: energy.confidence,
          valence: valence.confidence,
          context: contextConf,
          sources: n,
        }),
        high ? "aggregated" : "pending",
        high ? "tagged" : "needs_escalation",
        row.id,
      ]
    );
    if (high) aggregated++;
    else escalate++;
  }

  console.log(`Scored: ${aggregated} auto-tagged (≥${THRESHOLD}), ${escalate} marked for LLM escalation.`);
  await closePool();

}

main().catch((err) => { console.error(err); process.exit(1); });
