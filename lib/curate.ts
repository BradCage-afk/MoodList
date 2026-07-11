import { TAGS_BY_ID, type Tag } from "@/data/tags";
import {
  blendVectors,
  cosineSimilarity,
  scoreText,
  vectorFrom,
  type EmotionVector,
} from "@/lib/nrc";
import { searchTracks, type SpotifyTrack } from "@/lib/spotify";
import { getLyricsForScoring } from "@/lib/genius";

export interface CurateInput {
  text: string;
  tagIds: string[];
  /** Requested playlist length; clamped to [MIN_SIZE, MAX_SIZE]. */
  size?: number;
}

export const MIN_SIZE = 5;
export const MAX_SIZE = 50;
export const DEFAULT_SIZE = 24;

export interface CuratedTrack {
  id: string;
  uri: string;
  name: string;
  artists: string[];
  albumArt: string | null;
  /** 0-1 mood match score (lyrics-based when available). */
  score: number;
  scoredFromLyrics: boolean;
}

export type ProgressEvent =
  | { stage: "searching"; queries: number }
  | { stage: "pool"; candidates: number }
  | { stage: "lyrics"; done: number; total: number }
  | { stage: "ranking" }
  | { stage: "done"; tracks: CuratedTrack[]; summary: string }
  | { stage: "error"; message: string };

const POOL_CAP = 100;
const MAX_PER_ARTIST = 2;
const MAX_SEARCH_REQUESTS = 26; // parallel (query, offset) fetches per curation
const LYRICS_CONCURRENCY = 12;
const LYRICS_TIMEOUT_MS = 8000;
// Compilation/DJ-mix junk that plain-text search surfaces ("Bollywood
// Nonstop Dandiya Mashup") — never useful as a single mood-matched song.
const JUNK_TITLE = /nonstop|non stop|mashup|medley|megamix|jukebox|mixtape|dj mix/i;
// Score for tracks whose lyrics couldn't be fetched — kept mid-low so they
// can fill out a thin pool but never outrank a real lyrical match.
const NEUTRAL_SCORE = 0.3;

/** Blend selected tags + free text into one target vector in NRC space. */
export function buildTargetVector(input: CurateInput): EmotionVector {
  const tags = input.tagIds
    .map((id) => TAGS_BY_ID.get(id))
    .filter((t): t is Tag => !!t);

  const entries = tags
    .filter((t) => Object.keys(t.targetWeights).length > 0)
    .map((t) => ({ vector: vectorFrom(t.targetWeights), weight: 1 }));

  if (input.text.trim()) {
    const { vector, hits } = scoreText(input.text);
    if (hits > 0) entries.push({ vector, weight: 1.5 });
  }

  if (entries.length === 0) {
    // Nothing emotional to aim at — default to a broadly positive profile
    return vectorFrom({ joy: 1, positive: 1, trust: 0.5 });
  }
  return blendVectors(entries);
}

interface SearchPage {
  q: string;
  offset: number;
}

/**
 * Build a fan-out of (query, offset) search pages from tags + free text.
 * limit is capped at 10 per request, so breadth comes from many parallel
 * pages: query variants × offset pagination.
 */
export function buildSearchPlan(input: CurateInput): SearchPage[] {
  const tags = input.tagIds
    .map((id) => TAGS_BY_ID.get(id))
    .filter((t): t is Tag => !!t);

  const moodSeeds = tags.filter((t) => t.axis !== "genre").flatMap((t) => t.searchSeeds);
  const genreSeeds = tags.filter((t) => t.axis === "genre").flatMap((t) => t.searchSeeds);
  const text = input.text.trim();

  const plans: { q: string; pages: number }[] = [];
  const seen = new Set<string>();
  const add = (q: string, pages: number) => {
    const key = q.toLowerCase();
    if (q.length > 1 && !seen.has(key)) {
      seen.add(key);
      plans.push({ q, pages });
    }
  };

  if (text) {
    // The literal text, paginated deep — the main signal
    add(text, 4);
    // If the text is an artist name this returns their real catalog;
    // harmlessly empty otherwise
    add(`artist:"${text}"`, 3);
    for (const g of genreSeeds.slice(0, 3)) add(`${text} ${g}`, 2);
    if (moodSeeds.length > 0) {
      for (const m of moodSeeds.slice(0, 4)) add(`${text} ${m}`, 1);
    } else {
      // No mood tags to cross with — expand generically for breadth
      for (const s of ["hits", "top songs", "best songs"]) add(`${text} ${s}`, 1);
    }
  }
  // Mood seed × genre seed pairs, then bare mood seeds
  for (const m of moodSeeds) {
    if (genreSeeds.length > 0) {
      for (const g of genreSeeds.slice(0, 2)) add(`${m} ${g}`, 1);
    } else {
      add(m, 2);
    }
  }
  // Bare genre seeds as filler
  for (const g of genreSeeds) add(g, 2);

  const pages: SearchPage[] = [];
  for (const { q, pages: n } of plans) {
    for (let i = 0; i < n; i++) pages.push({ q, offset: i * 10 });
  }
  return pages.slice(0, MAX_SEARCH_REQUESTS);
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    })
  );
  return results;
}

export async function curate(
  accessToken: string,
  input: CurateInput,
  emit: (e: ProgressEvent) => void
): Promise<void> {
  const target = buildTargetVector(input);
  const resultSize = Math.min(
    MAX_SIZE,
    Math.max(MIN_SIZE, Math.round(input.size ?? DEFAULT_SIZE))
  );
  const pages = buildSearchPlan(input);
  if (pages.length === 0) {
    emit({ stage: "error", message: "Pick at least one tag or type something." });
    return;
  }

  emit({ stage: "searching", queries: pages.length });
  const searchResults = await Promise.all(
    pages.map(({ q, offset }) => searchTracks(accessToken, q, offset).catch(() => []))
  );

  // Dedupe by track id, drop compilation junk, prefer mainstream (popularity)
  // when trimming the pool
  const byId = new Map<string, SpotifyTrack>();
  for (const track of searchResults.flat()) {
    if (JUNK_TITLE.test(track.name)) continue;
    const prev = byId.get(track.id);
    // Keep the best rank-derived popularity seen across queries
    if (!prev || track.popularity > prev.popularity) byId.set(track.id, track);
  }
  const pool = [...byId.values()]
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, POOL_CAP);

  if (pool.length === 0) {
    emit({ stage: "error", message: "Spotify returned no tracks for that vibe — try different tags or words." });
    return;
  }
  emit({ stage: "pool", candidates: pool.length });

  // Lyrics fetch + scoring, concurrency-limited, per-track failure tolerant
  let done = 0;
  emit({ stage: "lyrics", done: 0, total: pool.length });
  const scored = await mapWithConcurrency(pool, LYRICS_CONCURRENCY, async (track) => {
    let score = NEUTRAL_SCORE;
    let scoredFromLyrics = false;
    try {
      const signal = AbortSignal.timeout(LYRICS_TIMEOUT_MS);
      const lyrics = await getLyricsForScoring(track.name, track.artists[0] ?? "", signal);
      if (lyrics) {
        const { vector, hits } = scoreText(lyrics);
        if (hits >= 5) {
          score = cosineSimilarity(vector, target);
          scoredFromLyrics = true;
        }
      }
    } catch {
      // no Genius match / fetch failure / timeout → keep neutral score
    }
    done++;
    if (done % 5 === 0 || done === pool.length) {
      emit({ stage: "lyrics", done, total: pool.length });
    }
    return { track, score, scoredFromLyrics };
  });

  emit({ stage: "ranking" });

  // Blend in a light popularity prior, rank, cap per artist
  const ranked = scored
    .map((s) => ({ ...s, final: 0.85 * s.score + 0.15 * (s.track.popularity / 100) }))
    .sort((a, b) => b.final - a.final);

  // If the free text IS an artist's name, the user wants that artist's
  // catalog — lift the diversity cap for them. For longer playlists the
  // base cap scales up so the pool can actually fill the request.
  const requestedArtist = normalizeName(input.text);
  const baseCap = Math.max(MAX_PER_ARTIST, Math.ceil(resultSize / 12));
  const perArtist = new Map<string, number>();
  const picked: CuratedTrack[] = [];
  for (const { track, final, scoredFromLyrics } of ranked) {
    const artistKey = (track.artists[0] ?? "").toLowerCase();
    const isRequested =
      requestedArtist.length > 0 &&
      track.artists.some((a) => normalizeName(a) === requestedArtist);
    const cap = isRequested ? resultSize : baseCap;
    const count = perArtist.get(artistKey) ?? 0;
    if (count >= cap) continue;
    perArtist.set(artistKey, count + 1);
    picked.push({
      id: track.id,
      uri: track.uri,
      name: track.name,
      artists: track.artists,
      albumArt: track.albumArt,
      score: Math.round(final * 100) / 100,
      scoredFromLyrics,
    });
    if (picked.length >= resultSize) break;
  }

  emit({ stage: "done", tracks: picked, summary: summarize(input) });
}

export function summarize(input: CurateInput): string {
  const labels = input.tagIds
    .map((id) => TAGS_BY_ID.get(id)?.label)
    .filter(Boolean) as string[];
  const parts = [...labels];
  if (input.text.trim()) parts.push(`“${input.text.trim().slice(0, 40)}”`);
  return parts.slice(0, 4).join(" · ") || "Custom mix";
}
