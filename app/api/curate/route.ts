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
const VISITOR_COOKIE = "ml_vid";
const VISITOR_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

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
  // Curation is a read against our own index, so it's open to everyone —
  // no Spotify login required. A session, when present, only unlocks the
  // per-user extras (history snapshot + activity log) below.
  const session = await auth();

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

    const userId = session?.spotifyId ?? null;

    // Analytics actor: the real Spotify ID when signed in, otherwise a stable
    // first-party visitor id so anonymous traffic and retention are still
    // measurable. No personal data — just an opaque random token in a cookie.
    let setVisitorCookie: string | null = null;
    let actorId = userId;
    if (!actorId) {
      let vid = readCookie(req.headers.get("cookie"), VISITOR_COOKIE);
      if (!vid) {
        vid = crypto.randomUUID();
        setVisitorCookie = vid;
      }
      actorId = `anon:${vid}`;
    }

    let historyId: number | null = null;
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
    }

    // Log every curation (signed-in or anonymous) so /admin can show traffic
    // and retention. Best-effort — never blocks the response.
    if (tracks.length > 0) {
      logActivity(actorId, session?.user?.name ?? null, "curate", {
        summary,
        tracks: tracks.length,
        anon: !userId,
      });
    }

    const res = Response.json({ tracks, summary, prefs, historyId });
    if (setVisitorCookie) {
      res.headers.append(
        "Set-Cookie",
        `${VISITOR_COOKIE}=${setVisitorCookie}; Path=/; Max-Age=${VISITOR_MAX_AGE}; HttpOnly; SameSite=Lax`
      );
    }
    return res;
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Curation failed" },
      { status: 500 }
    );
  }
}
