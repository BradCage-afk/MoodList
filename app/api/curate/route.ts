import { auth } from "@/auth";
import { buildPrefs, queryIndex } from "@/lib/query";
import { logActivity } from "@/lib/activity";
import { db } from "@/lib/db";
import { TAGS } from "@/data/tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const MIN_SIZE = 5;
const MAX_SIZE = 50;
const DEFAULT_SIZE = 24;
const HISTORY_CAP = 15;

function summarize(text: string, tagIds: string[]): string {
  if (text.trim()) return text.trim().slice(0, 80);
  const labels = tagIds
    .map((id) => TAGS.find((t) => t.id === id)?.label)
    .filter(Boolean)
    .slice(0, 4);
  return labels.join(" · ") || "Custom mix";
}

/**
 * POST /api/curate — query the pre-built index. This is a DB lookup, not a
 * live pipeline: no Spotify search, no lyrics, no LLM at request time.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken || session.error) {
    return Response.json({ error: "Not authenticated with Spotify" }, { status: 401 });
  }

  let body: { text?: string; tagIds?: string[]; size?: number; instrumentalOnly?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.slice(0, 300) : "";
  const tagIds = Array.isArray(body.tagIds) ? body.tagIds.filter((t) => typeof t === "string") : [];
  const size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(body.size ?? DEFAULT_SIZE)));
  const instrumentalOnly = body.instrumentalOnly === true;

  if (!text.trim() && tagIds.length === 0 && !instrumentalOnly) {
    return Response.json({ error: "Give me a vibe first — text or tags." }, { status: 400 });
  }

  try {
    const prefs = buildPrefs(text, tagIds, instrumentalOnly);
    const tracks = await queryIndex(prefs, size);
    const summary = summarize(text, tagIds);

    let historyId: number | null = null;
    const userId = session.spotifyId;
    if (userId && tracks.length > 0) {
      // Snapshot into history, then trim to the newest HISTORY_CAP entries.
      const ins = await db().query(
        `INSERT INTO history (user_id, query_text, selected_tags, track_ids, summary)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [userId, text || null, tagIds, tracks.map((t) => t.id), summary]
      );
      historyId = ins.rows[0].id;
      await db().query(
        `DELETE FROM history WHERE user_id = $1 AND id NOT IN
           (SELECT id FROM history WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2)`,
        [userId, HISTORY_CAP]
      );
      logActivity(userId, session.user?.name ?? null, "curate", {
        summary,
        tracks: tracks.length,
      });
    }

    return Response.json({ tracks, summary, prefs, historyId });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Curation failed" },
      { status: 500 }
    );
  }
}
