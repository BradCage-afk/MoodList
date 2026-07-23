"use client";

import { useEffect, useState } from "react";

interface ActivityRow {
  id: number;
  user_id: string;
  display_name: string | null;
  action: string;
  detail: { summary?: string; tracks?: number } | null;
  created_at: string;
}

interface UserStat {
  user_id: string;
  display_name: string | null;
  events: number;
  exports: number;
  last_seen: string;
}

/**
 * Owner-only activity dashboard. The API 404s for anyone whose Spotify ID
 * isn't ADMIN_SPOTIFY_ID, so this page renders "nothing here" for everyone
 * but the owner.
 */
export default function AdminPage() {
  const [data, setData] = useState<{ activity: ActivityRow[]; userStats: UserStat[] } | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    fetch("/api/admin")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setDenied(true));
  }, []);

  if (denied) {
    return (
      <main className="flex min-h-screen items-center justify-center text-ink-dim">
        Nothing here.
      </main>
    );
  }
  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center text-ink-dim">
        Loading…
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Moodlist activity</h1>

      <h2 className="mt-8 mb-3 text-xs font-medium uppercase tracking-[0.15em] text-ink-dim">
        Users ({data.userStats.length})
      </h2>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink-dim">
            <tr>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Events</th>
              <th className="px-3 py-2">Exports</th>
              <th className="px-3 py-2">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {data.userStats.map((u) => (
              <tr key={u.user_id} className="border-t border-line">
                <td className="px-3 py-2">{u.display_name ?? u.user_id}</td>
                <td className="px-3 py-2 tabular-nums">{u.events}</td>
                <td className="px-3 py-2 tabular-nums">{u.exports}</td>
                <td className="px-3 py-2 text-ink-dim">{new Date(u.last_seen).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 mb-3 text-xs font-medium uppercase tracking-[0.15em] text-ink-dim">
        Recent activity
      </h2>
      <ul className="space-y-1.5">
        {data.activity.map((a) => (
          <li key={a.id} className="rounded-lg border border-line bg-bg-raised/50 px-3 py-2 text-sm">
            <span className="text-ink-dim">{new Date(a.created_at).toLocaleString()}</span>{" "}
            <span className="font-medium">{a.display_name ?? a.user_id}</span>{" "}
            <span>{a.action}</span>
            {a.detail?.summary && (
              <span className="text-ink-dim">
                {" "}
                — “{a.detail.summary}”{a.detail.tracks ? ` (${a.detail.tracks} tracks)` : ""}
              </span>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
