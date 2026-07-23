import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { RankedTrack } from "@/lib/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HISTORY_CAP = 15;

/**
 * GET /api/history        — list the user's saved snapshots (newest first)
 * GET /api/history?id=N   — one snapshot with its full track objects restored
 */
export async function GET(req: Request) {
  const session = await auth();
  const userId = session?.spotifyId;
  if (!userId) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");

  if (id) {
    const { rows } = await db().query(
      `SELECT id, query_text, selected_tags, track_ids, summary, created_at
       FROM history WHERE user_id = $1 AND id = $2`,
      [userId, Number(id)]
    );
    if (rows.length === 0) return Response.json({ error: "Not found" }, { status: 404 });
    const entry = rows[0];
    const { rows: trackRows } = await db().query(
      `SELECT id, name, artists, album_art, language, genre_family, energy, valence,
              instrumental, context_tags, confidence, confidence_source
       FROM tracks WHERE id = ANY($1)`,
      [entry.track_ids]
    );
    const byId = new Map(trackRows.map((r) => [r.id, r]));
    // Preserve the snapshot's original order
    const tracks: RankedTrack[] = (entry.track_ids as string[])
      .map((tid) => byId.get(tid))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => ({
        id: r.id,
        uri: `spotify:track:${r.id}`,
        name: r.name,
        artists: (r.artists as { name: string }[]).map((a) => a.name),
        albumArt: r.album_art,
        confidence: r.confidence ?? 0.5,
        reason: "From your history — same snapshot as the original curation.",
        tags: {
          language: r.language,
          genre: r.genre_family,
          energy: r.energy,
          valence: r.valence,
          instrumental: r.instrumental,
          contexts: r.context_tags ?? [],
        },
      }));
    return Response.json({
      id: entry.id,
      summary: entry.summary,
      queryText: entry.query_text,
      selectedTags: entry.selected_tags,
      createdAt: entry.created_at,
      tracks,
    });
  }

  const { rows } = await db().query(
    `SELECT id, query_text, selected_tags, summary, created_at, cardinality(track_ids) AS track_count
     FROM history WHERE user_id = $1 ORDER BY created_at DESC, id DESC`,
    [userId]
  );
  return Response.json({ entries: rows, cap: HISTORY_CAP });
}

/**
 * DELETE /api/history?id=N — delete one snapshot
 * DELETE /api/history?all=1 — clear the user's entire history
 */
export async function DELETE(req: Request) {
  const session = await auth();
  const userId = session?.spotifyId;
  if (!userId) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const all = url.searchParams.get("all");

  if (all === "1") {
    const res = await db().query(`DELETE FROM history WHERE user_id = $1`, [userId]);
    return Response.json({ deleted: res.rowCount });
  }
  if (id) {
    const res = await db().query(`DELETE FROM history WHERE user_id = $1 AND id = $2`, [
      userId,
      Number(id),
    ]);
    return Response.json({ deleted: res.rowCount });
  }
  return Response.json({ error: "Pass ?id=N or ?all=1" }, { status: 400 });
}
