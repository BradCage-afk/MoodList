const API = "https://api.spotify.com/v1";

export interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  artists: string[];
  albumArt: string | null;
  popularity: number;
}

interface SpotifyApiTrack {
  id: string;
  uri: string;
  name: string;
  popularity: number;
  artists: { name: string }[];
  album: { images: { url: string; width: number }[] };
}

async function spotifyFetch(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  // One retry on rate limit, honoring Retry-After
  if (res.status === 429) {
    const wait = Math.min(Number(res.headers.get("Retry-After") ?? 1), 5);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  }
  return res;
}

/** Spotify search now caps limit at 10 per request — callers issue many small queries. */
export async function searchTracks(accessToken: string, query: string): Promise<SpotifyTrack[]> {
  const params = new URLSearchParams({ q: query, type: "track", limit: "10" });
  const res = await spotifyFetch(accessToken, `/search?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  const items: SpotifyApiTrack[] = data.tracks?.items ?? [];
  return items
    .filter((t) => t?.id)
    .map((t) => ({
      id: t.id,
      uri: t.uri,
      name: t.name,
      artists: t.artists.map((a) => a.name),
      albumArt: t.album?.images?.[0]?.url ?? null,
      popularity: t.popularity ?? 0,
    }));
}

/** Create a playlist for the current user — POST /me/playlists (the per-user-id endpoint is gone). */
export async function createPlaylist(
  accessToken: string,
  name: string,
  description: string
): Promise<{ id: string; url: string }> {
  const res = await spotifyFetch(accessToken, "/me/playlists", {
    method: "POST",
    body: JSON.stringify({ name, description, public: false }),
  });
  if (!res.ok) {
    throw new Error(`Playlist creation failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return { id: data.id, url: data.external_urls?.spotify ?? `https://open.spotify.com/playlist/${data.id}` };
}

export async function addTracksToPlaylist(
  accessToken: string,
  playlistId: string,
  uris: string[]
): Promise<void> {
  for (let i = 0; i < uris.length; i += 100) {
    // Feb 2026 API change: the endpoint is /items now; /tracks returns 403
    const res = await spotifyFetch(accessToken, `/playlists/${playlistId}/items`, {
      method: "POST",
      body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
    });
    if (!res.ok) {
      throw new Error(`Adding tracks failed (${res.status}): ${await res.text()}`);
    }
  }
}
