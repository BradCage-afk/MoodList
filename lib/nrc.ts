import lexiconJson from "@/data/nrc-lexicon.json";

/**
 * NRC Emotion Lexicon scoring (word-level v0.92, bundled offline in /data).
 * Emotion vectors are probability distributions over these 10 dimensions.
 */
export const NRC_DIMENSIONS = [
  "anger",
  "anticipation",
  "disgust",
  "fear",
  "joy",
  "negative",
  "positive",
  "sadness",
  "surprise",
  "trust",
] as const;

export type NrcDimension = (typeof NRC_DIMENSIONS)[number];
export type EmotionVector = number[]; // length 10, aligned with NRC_DIMENSIONS

const lexicon = lexiconJson as Record<string, NrcDimension[]>;
const DIM_INDEX = new Map(NRC_DIMENSIONS.map((d, i) => [d, i]));

export function zeroVector(): EmotionVector {
  return new Array(NRC_DIMENSIONS.length).fill(0);
}

/** Build a normalized vector from dimension weights, e.g. { joy: 2, positive: 1 }. */
export function vectorFrom(weights: Partial<Record<NrcDimension, number>>): EmotionVector {
  const v = zeroVector();
  for (const [dim, w] of Object.entries(weights)) {
    const i = DIM_INDEX.get(dim as NrcDimension);
    if (i !== undefined && w) v[i] = w;
  }
  return normalize(v);
}

function normalize(v: EmotionVector): EmotionVector {
  const total = v.reduce((s, x) => s + x, 0);
  return total > 0 ? v.map((x) => x / total) : v;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z]+/)
    .filter((t) => t.length >= 2);
}

/** Look up a token, falling back through common suffix strips (loving → love). */
function lookup(token: string): NrcDimension[] | undefined {
  if (lexicon[token]) return lexicon[token];
  for (const strip of [/s$/, /ing$/, /ed$/, /es$/]) {
    const base = token.replace(strip, "");
    if (base !== token && base.length >= 2 && lexicon[base]) return lexicon[base];
  }
  // loving → lov(+e) → love / hoping → hop(+e) → hope
  if (/ing$|ed$/.test(token)) {
    const base = token.replace(/ing$|ed$/, "") + "e";
    if (lexicon[base]) return lexicon[base];
  }
  return undefined;
}

/** Canonical lexicon word for a token (resolving suffix strips), or null. */
function canonical(token: string): string | null {
  if (lexicon[token]) return token;
  for (const strip of [/s$/, /ing$/, /ed$/, /es$/]) {
    const base = token.replace(strip, "");
    if (base !== token && base.length >= 2 && lexicon[base]) return base;
  }
  if (/ing$|ed$/.test(token)) {
    const base = token.replace(/ing$|ed$/, "") + "e";
    if (lexicon[base]) return base;
  }
  return null;
}

export interface TextAnalysis {
  /** Canonical lexicon word → occurrence count in this text. */
  counts: Map<string, number>;
  /** Total tokens examined (for coverage = hits / tokens). */
  tokens: number;
  /** Tokens that matched the lexicon. */
  hits: number;
}

/** Tokenize + match against the lexicon without building a vector yet. */
export function analyzeText(text: string): TextAnalysis {
  const counts = new Map<string, number>();
  let tokens = 0;
  let hits = 0;
  for (const token of tokenize(text)) {
    tokens++;
    const word = canonical(token);
    if (!word) continue;
    hits++;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return { counts, tokens, hits };
}

/**
 * Smoothed inverse document frequency over a per-request corpus of analyses.
 * Downweights words that appear in most lyrics ("love", "baby") so they stop
 * dominating every song's emotion profile.
 */
export function buildIdf(docs: TextAnalysis[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const word of doc.counts.keys()) df.set(word, (df.get(word) ?? 0) + 1);
  }
  const n = docs.length;
  const idf = new Map<string, number>();
  for (const [word, count] of df) {
    idf.set(word, Math.log((n + 1) / (count + 1)) + 1);
  }
  return idf;
}

/** Build a normalized emotion vector from an analysis: sublinear tf × idf. */
export function vectorFromAnalysis(
  analysis: TextAnalysis,
  idf?: Map<string, number>
): EmotionVector {
  const v = zeroVector();
  for (const [word, count] of analysis.counts) {
    const weight = (1 + Math.log(count)) * (idf?.get(word) ?? 1);
    for (const dim of lexicon[word]) v[DIM_INDEX.get(dim)!] += weight;
  }
  return normalize(v);
}

/**
 * Score free text (lyrics or a user query) into a normalized emotion vector.
 * `hits` is how many tokens matched the lexicon — callers use it to treat
 * low-signal texts as neutral rather than confidently wrong.
 */
export function scoreText(text: string): { vector: EmotionVector; hits: number } {
  const analysis = analyzeText(text);
  return { vector: vectorFromAnalysis(analysis), hits: analysis.hits };
}

/** Weighted average of several vectors (skips zero vectors), re-normalized. */
export function blendVectors(entries: { vector: EmotionVector; weight?: number }[]): EmotionVector {
  const out = zeroVector();
  for (const { vector, weight = 1 } of entries) {
    if (vector.every((x) => x === 0)) continue;
    for (let i = 0; i < out.length; i++) out[i] += vector[i] * weight;
  }
  return normalize(out);
}

export function cosineSimilarity(a: EmotionVector, b: EmotionVector): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
