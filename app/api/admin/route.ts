import { auth } from "@/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin — activity feed. Only the owner (ADMIN_SPOTIFY_ID) can read
 * this; everyone else gets a 404 so the endpoint's existence isn't
 * advertised.
 */
export async function GET() {
  const session = await auth();
  const adminId = process.env.ADMIN_SPOTIFY_ID;
  if (!adminId || !session?.spotifyId || session.spotifyId !== adminId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { rows: activity } = await db().query(
    `SELECT id, user_id, display_name, action, detail, created_at
     FROM activity_log ORDER BY created_at DESC LIMIT 200`
  );
  const { rows: userStats } = await db().query(
    `SELECT user_id, max(display_name) AS display_name, count(*)::int AS events,
            count(*) FILTER (WHERE action = 'export')::int AS exports,
            max(created_at) AS last_seen
     FROM activity_log GROUP BY user_id ORDER BY last_seen DESC`
  );

  // Traffic + retention headline numbers. A "visitor" is any distinct actor
  // (a Spotify id when signed in, an anon:<cookie> id otherwise). "Returning"
  // = seen active on more than one calendar day.
  const { rows: statsRows } = await db().query(
    `SELECT
       count(*) FILTER (WHERE action = 'curate')::int  AS curations,
       count(*) FILTER (WHERE action = 'export')::int  AS playlists,
       count(DISTINCT user_id)::int                    AS visitors,
       count(DISTINCT user_id) FILTER (WHERE user_id LIKE 'anon:%')::int AS anon_visitors,
       count(*) FILTER (WHERE action = 'curate' AND created_at > now() - interval '24 hours')::int AS curations_24h,
       count(DISTINCT user_id) FILTER (WHERE created_at > now() - interval '24 hours')::int         AS visitors_24h
     FROM activity_log`
  );
  const { rows: retRows } = await db().query(
    `SELECT count(*)::int AS returning FROM (
       SELECT user_id FROM activity_log
       GROUP BY user_id HAVING count(DISTINCT date_trunc('day', created_at)) > 1
     ) s`
  );
  const stats = { ...statsRows[0], returning: retRows[0].returning };

  // Every playlist that's been created, newest first.
  const { rows: playlists } = await db().query(
    `SELECT id, display_name, user_id, detail, created_at
     FROM activity_log WHERE action = 'export' ORDER BY created_at DESC LIMIT 100`
  );

  return Response.json({ stats, activity, userStats, playlists });
}
