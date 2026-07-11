import { TAGS_BY_ID, type Tag } from "@/data/tags";
import {
  analyzeText,
  blendVectors,
  buildIdf,
  cosineSimilarity,
  NRC_DIMENSIONS,
  scoreText,
  vectorFrom,
  vectorFromAnalysis,
  type EmotionVector,
  type NrcDimension,
  type TextAnalysis,
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
  /** 0-1: how much we trust the lyric-based emotion reading. */
  confidence: number;
  /** Top emotion dimensions of the track's lyrics, as % of its profile. */
  emotions: { dim: NrcDimension; pct: number }[];
  /** One-line human explanation of why this track was picked. */
  reason: string;
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

/**
 * Did the user literally ask for this track in their free text? True when
 * the text IS one of the track's artists ("c418"), IS the track's base
 * title ("stitches"), or names both title and artist ("stitches by shawn
 * mendes"). Such tracks rank ahead of pure mood matches.
 */
function matchesQuery(track: SpotifyTrack, nText: string): boolean {
  if (nText.length < 3) return false;
  const artistNorms = track.artists.map(normalizeName);
  if (artistNorms.some((a) => a === nText)) return true;
  const title = normalizeName(track.name.replace(/\(.*?\)|\[.*?\]/g, "").split(" - ")[0]);
  if (title.length < 3) return false;
  if (title === nText) return true;
  return nText.includes(title) && artistNorms.some((a) => a.length >= 3 && nText.includes(a));
}

/** Top-n emotion dimensions of a normalized vector, as percentages. */
function topDims(v: EmotionVector, n: number): { dim: NrcDimension; pct: number }[] {
  return v
    .map((x, i) => ({ dim: NRC_DIMENSIONS[i], pct: Math.round(x * 100) }))
    .filter((d) => d.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, n);
}

function describePick(
  emotions: { dim: NrcDimension; pct: number }[],
  confidence: number,
  scoredFromLyrics: boolean,
  targetTop: NrcDimension[]
): string {
  if (!scoredFromLyrics) return "No usable lyrics found — ranked by search relevance.";
  const level = confidence >= 0.7 ? "high" : confidence >= 0.4 ? "medium" : "low";
  const overlap = emotions.filter((e) => targetTop.includes(e.dim)).map((e) => e.dim);
  if (overlap.length > 0) {
    return `Lyrics lean ${overlap.join(" + ")} — right on your target (${level} lyric confidence).`;
  }
  const top = emotions.slice(0, 2).map((e) => e.dim);
  return `Lyrics profile is mostly ${top.join(" + ")} (${level} lyric confidence).`;
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

  // Phase 1: fetch + lexicon-analyze lyrics — no scoring yet, since tf-idf
  // needs the whole request's corpus first. Concurrency-limited, per-track
  // failure tolerant.
  let done = 0;
  emit({ stage: "lyrics", done: 0, total: pool.length });
  const analyzed = await mapWithConcurrency(pool, LYRICS_CONCURRENCY, async (track) => {
    let analysis: TextAnalysis | null = null;
    try {
      const signal = AbortSignal.timeout(LYRICS_TIMEOUT_MS);
      const lyrics = await getLyricsForScoring(track.name, track.artists[0] ?? "", signal);
      if (lyrics) analysis = analyzeText(lyrics);
    } catch {
      // no Genius match / fetch failure / timeout → no lyric signal
    }
    done++;
    if (done % 5 === 0 || done === pool.length) {
      emit({ stage: "lyrics", done, total: pool.length });
    }
    return { track, analysis };
  });

  emit({ stage: "ranking" });

  // Phase 2: tf-idf weighted scoring over this request's lyric corpus.
  // Confidence (from lexicon hit count × coverage) pulls the score toward
  // neutral when the lyric evidence is thin — a handful of matched words
  // should never outrank a solid lyrical match, in either direction.
  const idf = buildIdf(
    analyzed.flatMap((a) => (a.analysis && a.analysis.hits > 0 ? [a.analysis] : []))
  );
  const targetTop = topDims(target, 2).map((d) => d.dim);
  const scored = analyzed.map(({ track, analysis }) => {
    let score = NEUTRAL_SCORE;
    let confidence = 0;
    let emotions: { dim: NrcDimension; pct: number }[] = [];
    if (analysis && analysis.hits > 0) {
      const vector = vectorFromAnalysis(analysis, idf);
      const coverage = analysis.tokens > 0 ? analysis.hits / analysis.tokens : 0;
      confidence = Math.sqrt(
        Math.min(1, analysis.hits / 25) * Math.min(1, coverage / 0.08)
      );
      score = confidence * cosineSimilarity(vector, target) + (1 - confidence) * NEUTRAL_SCORE;
      emotions = topDims(vector, 3);
    }
    const scoredFromLyrics = confidence >= 0.25;
    return {
      track,
      score,
      confidence,
      emotions,
      scoredFromLyrics,
      reason: describePick(emotions, confidence, scoredFromLyrics, targetTop),
    };
  });

  // Blend in a light popularity prior. Tracks the user literally asked for
  // (artist name or song title in the free text) rank ahead of everything —
  // mood scoring only orders within each group. Without this, an
  // instrumental artist search (no lyrics → neutral score) loses its top
  // spots to lyric-matched strangers.
  const nText = normalizeName(input.text);
  const ranked = scored
    .map((s) => ({
      ...s,
      requested: matchesQuery(s.track, nText),
      final: 0.85 * s.score + 0.15 * (s.track.popularity / 100),
    }))
    .sort((a, b) => Number(b.requested) - Number(a.requested) || b.final - a.final);

  // Diversity cap scales with playlist size; requested tracks bypass it so
  // an artist search can fill the playlist and song versions all show up.
  const baseCap = Math.max(MAX_PER_ARTIST, Math.ceil(resultSize / 12));
  const perArtist = new Map<string, number>();
  const picked: CuratedTrack[] = [];
  for (const { track, final, scoredFromLyrics, confidence, emotions, reason, requested } of ranked) {
    const artistKey = (track.artists[0] ?? "").toLowerCase();
    const cap = requested ? resultSize : baseCap;
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
      confidence: Math.round(confidence * 100) / 100,
      emotions,
      reason: requested ? "Directly matches what you searched for." : reason,
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
  if (input.text.trim()) parts.push(`“${input.text.trim().slice(0, 80)}”`);
  return parts.slice(0, 4).join(" · ") || "Custom mix";
}
