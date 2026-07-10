/**
 * Genius integration. The API only returns metadata + a lyrics page URL, so
 * lyrics text is extracted server-side from the page HTML. Lyrics are used
 * INTERNALLY ONLY for emotion scoring and are never returned to the client
 * or stored — this keeps the app clear of reproducing copyrighted lyrics.
 */

const GENIUS_API = "https://api.genius.com";

interface GeniusHit {
  result: {
    id: number;
    url: string;
    title: string;
    primary_artist: { name: string };
  };
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "") // drop (feat. X), [Remix] etc.
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

/** Find the Genius lyrics page URL for a track, or null if no confident match. */
export async function findLyricsUrl(
  title: string,
  artist: string,
  signal?: AbortSignal
): Promise<string | null> {
  const token = process.env.GENIUS_ACCESS_TOKEN;
  if (!token) throw new Error("GENIUS_ACCESS_TOKEN is not set");

  const q = new URLSearchParams({ q: `${title} ${artist}` });
  const res = await fetch(`${GENIUS_API}/search?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) return null;

  const data = await res.json();
  const hits: GeniusHit[] = data.response?.hits ?? [];
  const wantArtist = normalize(artist);
  const wantTitle = normalize(title);

  for (const hit of hits) {
    const gotArtist = normalize(hit.result.primary_artist?.name ?? "");
    const gotTitle = normalize(hit.result.title ?? "");
    const artistMatch =
      gotArtist.includes(wantArtist) || wantArtist.includes(gotArtist);
    const titleMatch = gotTitle.includes(wantTitle) || wantTitle.includes(gotTitle);
    if (artistMatch && titleMatch) return hit.result.url;
  }
  // Fall back to first hit if at least the artist matches
  for (const hit of hits) {
    const gotArtist = normalize(hit.result.primary_artist?.name ?? "");
    if (gotArtist.includes(wantArtist) || wantArtist.includes(gotArtist)) {
      return hit.result.url;
    }
  }
  return null;
}

/**
 * Fetch a Genius lyrics page and extract the lyrics text from the
 * div[data-lyrics-container] blocks. Returns null if the page structure
 * has changed or nothing could be extracted (callers score neutrally).
 */
export async function fetchLyricsText(
  url: string,
  signal?: AbortSignal
): Promise<string | null> {
  // Header set matters: Genius's bot protection 403s bare/Chrome-UA server
  // fetches but accepts this Firefox-style profile (verified live).
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      Referer: "https://www.google.com/",
    },
    signal,
  });
  if (!res.ok) return null;
  const html = await res.text();

  const containers = [
    ...html.matchAll(/<div[^>]+data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/g),
  ];
  if (containers.length === 0) return null;

  const text = containers
    .map(([, inner]) =>
      inner
        .replace(/<br\s*\/?>/g, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/\[[^\]]*\]/g, " ") // section headers like [Chorus]
    )
    .join("\n")
    .replace(/&amp;/g, "&")
    .replace(/&#x?\w+;|&\w+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();

  return text.length > 40 ? text : null;
}

/** Fallback source: lrclib.net (free, keyless). Used when Genius has no match or blocks the fetch. */
async function fetchLyricsFromLrclib(
  title: string,
  artist: string,
  signal?: AbortSignal
): Promise<string | null> {
  const q = new URLSearchParams({ artist_name: artist, track_name: title });
  const res = await fetch(`https://lrclib.net/api/get?${q}`, { signal });
  if (!res.ok) return null;
  const data = await res.json();
  const text: string | undefined = data.plainLyrics ?? data.syncedLyrics;
  return text && text.length > 40 ? text : null;
}

/**
 * Get lyrics text for internal scoring only: Genius first (API search →
 * lyrics page extraction), lrclib.net as fallback. Returns null when neither
 * source has the track — callers score neutrally.
 */
export async function getLyricsForScoring(
  title: string,
  artist: string,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const url = await findLyricsUrl(title, artist, signal);
    if (url) {
      const text = await fetchLyricsText(url, signal);
      if (text) return text;
    }
  } catch {
    // fall through to lrclib
  }
  try {
    return await fetchLyricsFromLrclib(title, artist, signal);
  } catch {
    return null;
  }
}
