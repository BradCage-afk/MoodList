import { auth } from "@/auth";
import { buildPrefs } from "@/lib/query";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * POST /api/preview — live feedback while the user composes a mood: how many
 * indexed tracks match the current selection, a few of their covers, and
 * which context tags co-occur most with it (the "pairs well with" hints).
 * Same instant-index query as curate, just cheaper and without history.
 */

// context tag stored in the index → tag-chip id in the composer
const CONTEXT_TO_CHIP: Record<string, string> = {
  workout: "workout",
  running: "workout",
  study: "study",
  focus: "focus",
  sleep: "sleep",
  party: "party",
  dance: "party",
  "road-trip": "driving",
  driving: "driving",
  romance: "romantic",
  wedding: "wedding",
  breakup: "heartbreak",
  heartbreak: "heartbreak",
  motivation: "empowered",
  chill: "chill",
  meditation: "meditation",
  gaming: "gaming",
  cooking: "cooking",
  summer: "summer",
  winter: "winter",
  monsoon: "rainy-day",
  rain: "rainy-day",
  nostalgia: "nostalgic",
  festival: "festival",
  devotional: "gospel",
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken || session.error) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { text?: string; tagIds?: string[]; instrumentalOnly?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.slice(0, 300) : "";
  const tagIds = Array.isArray(body.tagIds) ? body.tagIds.filter((t) => typeof t === "string") : [];
  const instrumentalOnly = body.instrumentalOnly === true;

  const prefs = buildPrefs(text, tagIds, instrumentalOnly);
  const hasSignal =
    prefs.languages.length > 0 ||
    prefs.genres.length > 0 ||
    prefs.contexts.length > 0 ||
    prefs.valence !== null ||
    prefs.energy !== null ||
    instrumentalOnly;

  // Idle state: just report catalog size.
  if (!hasSignal) {
    const { rows } = await db().query(`SELECT count(*)::int AS n FROM tracks WHERE status = 'tagged'`);
    return Response.json({ count: rows[0].n, idle: true, covers: [], suggestions: [] });
  }

  const params = [prefs.languages, prefs.genres, prefs.valence, prefs.energy, prefs.contexts, instrumentalOnly];
  const matchWhere = `
    t.status = 'tagged'
    AND ($6::boolean = false OR t.instrumental = true)
    AND (
      (cardinality($1::text[]) > 0 AND t.language = ANY($1))
      OR (cardinality($2::text[]) > 0 AND t.genre_family = ANY($2))
      OR ($3::text IS NOT NULL AND t.valence = $3)
      OR ($4::text IS NOT NULL AND t.energy = $4)
      OR (cardinality($5::text[]) > 0 AND t.context_tags && $5)
    )`;

  const [countRes, coverRes, coRes] = await Promise.all([
    db().query(`SELECT count(*)::int AS n FROM tracks t WHERE ${matchWhere}`, params),
    db().query(
      `SELECT t.album_art FROM tracks t
       WHERE ${matchWhere} AND t.album_art IS NOT NULL
       ORDER BY (
           CASE WHEN cardinality($1::text[]) > 0 AND t.language = ANY($1) THEN 30 ELSE 0 END
         + CASE WHEN cardinality($2::text[]) > 0 AND t.genre_family = ANY($2) THEN 25 ELSE 0 END
         + CASE WHEN $3::text IS NOT NULL AND t.valence = $3 THEN 20 ELSE 0 END
         + CASE WHEN $4::text IS NOT NULL AND t.energy = $4 THEN 15 ELSE 0 END
         + cardinality(ARRAY(SELECT unnest(t.context_tags) INTERSECT SELECT unnest($5::text[]))) * 8
       ) * coalesce(t.confidence, 0.5) DESC
       LIMIT 5`,
      params
    ),
    db().query(
      `SELECT unnest(t.context_tags) AS ctx, count(*)::int AS n
       FROM tracks t WHERE ${matchWhere}
       GROUP BY 1 ORDER BY n DESC LIMIT 12`,
      params
    ),
  ]);

  // Co-occurring contexts → chip suggestions the user hasn't already picked
  const chosen = new Set(tagIds);
  const suggestions: string[] = [];
  for (const row of coRes.rows) {
    const chip = CONTEXT_TO_CHIP[row.ctx];
    if (chip && !chosen.has(chip) && !suggestions.includes(chip)) suggestions.push(chip);
    if (suggestions.length >= 3) break;
  }

  return Response.json({
    count: countRes.rows[0].n,
    idle: false,
    covers: coverRes.rows.map((r) => r.album_art as string),
    suggestions,
  });
}
