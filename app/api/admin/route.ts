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
  return Response.json({ activity, userStats });
}
