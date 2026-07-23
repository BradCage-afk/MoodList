// The shared tag vocabulary for the whole project: the LLM is constrained to
// these values, the DB stores them, and the web app queries against them.

export const LANGUAGES = [
  "english", "hindi", "punjabi", "tamil", "telugu", "korean", "japanese",
  "spanish", "portuguese", "arabic", "french", "german", "italian",
  "indonesian", "turkish", "mandarin", "thai", "vietnamese", "filipino",
] as const;

export const GENRE_FAMILIES = [
  "pop", "rock", "metal", "hip-hop", "r&b", "electronic", "house", "techno",
  "classical", "jazz", "blues", "folk", "country", "latin", "reggaeton",
  "reggae", "afrobeats", "amapiano", "bollywood", "punjabi-pop", "south-indian",
  "k-pop", "j-pop", "c-pop", "arabic-pop", "indie", "funk", "gospel",
  "lofi", "ambient", "soundtrack", "phonk", "disco",
] as const;

export const CONTEXT_TAGS = [
  "workout", "running", "study", "focus", "sleep", "party", "dance",
  "road-trip", "driving", "romance", "wedding", "breakup", "heartbreak",
  "motivation", "chill", "meditation", "gaming", "cooking", "summer",
  "winter", "monsoon", "rain", "nostalgia", "festival", "devotional",
] as const;

export const ENERGY = ["high", "medium", "low"] as const;
export const VALENCE = ["positive", "negative", "neutral"] as const;

export interface TagObject {
  language: string | null;
  genre_family: string | null;
  energy: "high" | "medium" | "low" | null;
  valence: "positive" | "negative" | "neutral" | null;
  instrumental: boolean | null;
  context_tags: string[];
}

/** Coerce arbitrary LLM output into a valid TagObject (unknown values → null/dropped). */
export function sanitizeTags(raw: unknown): TagObject {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = <T extends readonly string[]>(v: unknown, allowed: T): T[number] | null =>
    typeof v === "string" && (allowed as readonly string[]).includes(v.toLowerCase())
      ? (v.toLowerCase() as T[number])
      : null;
  return {
    language: pick(o.language, LANGUAGES),
    genre_family: pick(o.genre_family, GENRE_FAMILIES),
    energy: pick(o.energy, ENERGY),
    valence: pick(o.valence, VALENCE),
    instrumental: typeof o.instrumental === "boolean" ? o.instrumental : null,
    context_tags: Array.isArray(o.context_tags)
      ? o.context_tags
          .filter((t): t is string => typeof t === "string")
          .map((t) => t.toLowerCase())
          .filter((t) => (CONTEXT_TAGS as readonly string[]).includes(t))
      : [],
  };
}
