// Spotify client for the indexer. Auth is the user refresh token captured by
// spotify-user-auth.ts (2026 API: search works with any token, but the token
// endpoint below also serves the app's future needs). All requests go through
// one throttled queue with 429 retry-after handling.
import { requireEnv } from "./env";

const clientId = requireEnv("SPOTIFY_CLIENT_ID");
const clientSecret = requireEnv("SPOTIFY_CLIENT_SECRET");
const refreshToken = requireEnv("SPOTIFY_REFRESH_TOKEN");

let accessToken: string | null = null;
let expiresAt = 0;

async function token(): Promise<string> {
  if (accessToken && Date.now() < expiresAt - 60_000) return accessToken;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error(`Spotify token refresh failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  accessToken = data.access_token;
  expiresAt = Date.now() + data.expires_in * 1000;
  return accessToken;
}

// Simple global throttle: at most one request every MIN_GAP_MS.
const MIN_GAP_MS = 250;
let lastRequest = 0;
let queue: Promise<unknown> = Promise.resolve();

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    const wait = lastRequest + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();
    return fn();
  });
  queue = next.catch(() => {});
  return next as Promise<T>;
}

// Retries live INSIDE one queued task (never re-enter throttled() from a
// running task — that deadlocks the queue, drains the event loop, and the
// process exits 0 mid-run with no error).
export async function spotifyGet<T>(path: string): Promise<T> {
  return throttled(async () => {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(`https://api.spotify.com/v1${path}`, {
          headers: { Authorization: `Bearer ${await token()}` },
          // A hung request would otherwise stall the queue forever.
          signal: AbortSignal.timeout(30_000),
        });
      } catch (err) {
        if (attempt < 3 && /timeout|abort|fetch failed|ECONNRESET/i.test(String(err))) {
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        throw err;
      }
      if (res.status === 429 && attempt < 5) {
        const retryAfter = Number(res.headers.get("retry-after") ?? 2);
        // Spotify's extended dev-mode penalty sends hour-scale values —
        // fail fast with a clear message instead of parking for a day.
        if (retryAfter > 900) {
          throw new Error(
            `Spotify rate ban: retry-after ${retryAfter}s (~${Math.round(retryAfter / 3600)}h). Resume later.`
          );
        }
        await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
        continue;
      }
      if (res.status >= 500 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`Spotify GET ${path} → ${res.status} ${(await res.text()).slice(0, 120)}`);
      return (await res.json()) as T;
    }
  });
}

export interface SearchTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: { name: string; images: { url: string }[]; release_date?: string };
  duration_ms: number;
  explicit: boolean;
}

// 2026 API: limit hard-capped at 10; offsets verified working past 490.
export async function searchTracks(query: string, market: string, offset: number): Promise<SearchTrack[]> {
  const params = new URLSearchParams({ q: query, type: "track", limit: "10", offset: String(offset), market });
  const data = await spotifyGet<{ tracks?: { items?: (SearchTrack | null)[] } }>(`/search?${params}`);
  return (data.tracks?.items ?? []).filter((t): t is SearchTrack => !!t?.id);
}
