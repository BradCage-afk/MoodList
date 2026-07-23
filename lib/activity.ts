// Activity logging for the admin page: who logged in, who curated, who
// exported. Best-effort — failures are swallowed so logging can never break
// a user-facing flow.
import { db } from "@/lib/db";

export async function logActivity(
  userId: string,
  displayName: string | null,
  action: "login" | "curate" | "export" | string,
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    await db().query(
      `INSERT INTO activity_log (user_id, display_name, action, detail) VALUES ($1, $2, $3, $4)`,
      [userId, displayName, action, detail ? JSON.stringify(detail) : null]
    );
  } catch {
    // never let logging break the app
  }
}
