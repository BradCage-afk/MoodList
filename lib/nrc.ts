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

/**
 * Score free text (lyrics or a user query) into a normalized emotion vector.
 * `hits` is how many tokens matched the lexicon — callers use it to treat
 * low-signal texts as neutral rather than confidently wrong.
 */
export function scoreText(text: string): { vector: EmotionVector; hits: number } {
  const v = zeroVector();
  let hits = 0;
  for (const token of tokenize(text)) {
    const dims = lookup(token);
    if (!dims) continue;
    hits++;
    for (const dim of dims) v[DIM_INDEX.get(dim)!]++;
  }
  return { vector: normalize(v), hits };
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
