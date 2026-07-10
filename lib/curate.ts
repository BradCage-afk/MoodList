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
}

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

const POOL_CAP = 70;
const RESULT_SIZE = 24;
const MAX_PER_ARTIST = 2;
const LYRICS_CONCURRENCY = 10;
const LYRICS_TIMEOUT_MS = 8000;
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

/** Build a set of small search queries from tags + free text (limit=10 each). */
export function buildSearchQueries(input: CurateInput): string[] {
  const tags = input.tagIds
    .map((id) => TAGS_BY_ID.get(id))
    .filter((t): t is Tag => !!t);

  const moodSeeds = tags.filter((t) => t.axis !== "genre").flatMap((t) => t.searchSeeds);
  const genreSeeds = tags.filter((t) => t.axis === "genre").flatMap((t) => t.searchSeeds);
  const text = input.text.trim();

  const queries = new Set<string>();

  // Free text is used literally, alone and with each genre
  if (text) {
    queries.add(text);
    for (const g of genreSeeds.slice(0, 3)) queries.add(`${text} ${g}`);
  }
  // Mood seed × genre seed pairs, then bare mood seeds
  for (const m of moodSeeds) {
    if (genreSeeds.length > 0) {
      for (const g of genreSeeds.slice(0, 2)) queries.add(`${m} ${g}`);
    } else {
      queries.add(m);
    }
  }
  // Bare genre seeds as filler
  for (const g of genreSeeds) queries.add(g);

  const list = [...queries].filter((q) => q.length > 1);
  // 8-10 parallel searches ≈ up to 80-100 raw results before dedupe
  return list.slice(0, 10);
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
  const queries = buildSearchQueries(input);
  if (queries.length === 0) {
    emit({ stage: "error", message: "Pick at least one tag or type something." });
    return;
  }

  emit({ stage: "searching", queries: queries.length });
  const searchResults = await Promise.all(
    queries.map((q) => searchTracks(accessToken, q).catch(() => []))
  );

  // Dedupe by track id, prefer mainstream (popularity) when trimming the pool
  const byId = new Map<string, SpotifyTrack>();
  for (const track of searchResults.flat()) {
    if (!byId.has(track.id)) byId.set(track.id, track);
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

  const perArtist = new Map<string, number>();
  const picked: CuratedTrack[] = [];
  for (const { track, final, scoredFromLyrics } of ranked) {
    const artistKey = (track.artists[0] ?? "").toLowerCase();
    const count = perArtist.get(artistKey) ?? 0;
    if (count >= MAX_PER_ARTIST) continue;
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
    if (picked.length >= RESULT_SIZE) break;
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
