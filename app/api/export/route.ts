import { auth } from "@/auth";
import { addTracksToPlaylist, createPlaylist } from "@/lib/spotify";
import { logActivity } from "@/lib/activity";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** POST /api/export — create the playlist in the user's Spotify account. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken || session.error) {
    return Response.json({ error: "Not authenticated with Spotify" }, { status: 401 });
  }

  let body: { uris?: string[]; summary?: string; historyId?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const uris = (body.uris ?? []).filter(
    (u) => typeof u === "string" && u.startsWith("spotify:track:")
  );
  if (uris.length === 0) {
    return Response.json({ error: "No tracks to export" }, { status: 400 });
  }

  const summary = (body.summary ?? "Custom mix").slice(0, 60);
  try {
    const playlist = await createPlaylist(
      session.accessToken,
      `Mood: ${summary}`,
      "Curated from Moodlist's pre-indexed multilingual mood catalog."
    );
    await addTracksToPlaylist(session.accessToken, playlist.id, uris);

    // Exported snapshots leave history immediately — the cap only ever
    // applies to unexported entries.
    if (session.spotifyId && typeof body.historyId === "number") {
      await db()
        .query(`DELETE FROM history WHERE user_id = $1 AND id = $2`, [
          session.spotifyId,
          body.historyId,
        ])
        .catch(() => {});
    }
    if (session.spotifyId) {
      logActivity(session.spotifyId, session.user?.name ?? null, "export", {
        summary,
        tracks: uris.length,
      });
    }

    return Response.json({ url: playlist.url });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Export failed" },
      { status: 502 }
    );
  }
}
