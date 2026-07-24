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

interface Stats {
  curations: number;
  playlists: number;
  visitors: number;
  anon_visitors: number;
  returning: number;
  curations_24h: number;
  visitors_24h: number;
}

interface AdminData {
  stats: Stats;
  activity: ActivityRow[];
  userStats: UserStat[];
  playlists: ActivityRow[];
}

function actorLabel(displayName: string | null, userId: string): string {
  if (displayName) return displayName;
  if (userId.startsWith("anon:")) return `Guest ${userId.slice(5, 11)}`;
  return userId;
}

/**
 * Owner-only activity dashboard. The API 404s for anyone whose Spotify ID
 * isn't ADMIN_SPOTIFY_ID, so this page renders "nothing here" for everyone
 * but the owner.
 */
export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
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

  const s = data.stats;
  const cards: { label: string; value: number; hint?: string }[] = [
    { label: "Playlists made", value: s.playlists },
    { label: "Curations", value: s.curations, hint: `${s.curations_24h} in 24h` },
    { label: "Visitors", value: s.visitors, hint: `${s.anon_visitors} guests` },
    { label: "Returning", value: s.returning, hint: "2+ days active" },
    { label: "Active 24h", value: s.visitors_24h },
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Moodlist activity</h1>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-line bg-bg-raised/50 px-4 py-3">
            <p className="text-2xl font-semibold tabular-nums">{c.value.toLocaleString()}</p>
            <p className="mt-0.5 text-xs text-ink-dim">{c.label}</p>
            {c.hint && <p className="text-[11px] text-ink-dim/70">{c.hint}</p>}
          </div>
        ))}
      </div>

      <h2 className="mt-8 mb-3 text-xs font-medium uppercase tracking-[0.15em] text-ink-dim">
        Playlists made ({data.playlists.length})
      </h2>
      {data.playlists.length === 0 ? (
        <p className="text-sm text-ink-dim">No playlists exported yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {data.playlists.map((p) => (
            <li key={p.id} className="rounded-lg border border-line bg-bg-raised/50 px-3 py-2 text-sm">
              <span className="text-ink-dim">{new Date(p.created_at).toLocaleString()}</span>{" "}
              <span className="font-medium">{actorLabel(p.display_name, p.user_id)}</span>
              {p.detail?.summary && (
                <span>
                  {" "}
                  — “{p.detail.summary}”{p.detail.tracks ? ` (${p.detail.tracks} tracks)` : ""}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

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
                <td className="px-3 py-2">{actorLabel(u.display_name, u.user_id)}</td>
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
            <span className="font-medium">{actorLabel(a.display_name, a.user_id)}</span>{" "}
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
