// The "virtual playlist" matrix. The 2026 Spotify API no longer exposes any
// third-party playlist's contents (editorial playlists 404, user playlists
// return metadata only), so the index is sourced from curated search queries
// instead: each query plays the role a playlist name+description used to play
// — it carries authored tag hints, gets normalized by the LLM in step 2, and
// tracks aggregate agreement across every query that surfaces them.
import type { TagObject } from "./tagSchema";

export interface SourceDef {
  query: string;
  markets: string[];
  category: "language" | "mood" | "activity" | "genre" | "instrumental" | "era";
  hints: Partial<TagObject>;
}

interface LanguageDef {
  name: string; // word used inside queries
  language: string | null;
  genre: string | null;
  markets: string[];
}

const LANGUAGE_DEFS: LanguageDef[] = [
  { name: "bollywood", language: "hindi", genre: "bollywood", markets: ["IN"] },
  { name: "hindi", language: "hindi", genre: "bollywood", markets: ["IN"] },
  { name: "punjabi", language: "punjabi", genre: "punjabi-pop", markets: ["IN"] },
  { name: "tamil", language: "tamil", genre: "south-indian", markets: ["IN"] },
  { name: "telugu", language: "telugu", genre: "south-indian", markets: ["IN"] },
  { name: "k-pop", language: "korean", genre: "k-pop", markets: ["KR", "US"] },
  { name: "j-pop", language: "japanese", genre: "j-pop", markets: ["JP"] },
  { name: "latin", language: "spanish", genre: "latin", markets: ["MX", "ES"] },
  { name: "spanish", language: "spanish", genre: "latin", markets: ["MX", "ES"] },
  { name: "brazilian", language: "portuguese", genre: "latin", markets: ["BR"] },
  { name: "arabic", language: "arabic", genre: "arabic-pop", markets: ["EG", "SA"] },
  { name: "french", language: "french", genre: "pop", markets: ["FR"] },
  { name: "german", language: "german", genre: "pop", markets: ["DE"] },
  { name: "italian", language: "italian", genre: "pop", markets: ["IT"] },
  { name: "indonesian", language: "indonesian", genre: "pop", markets: ["ID"] },
  { name: "turkish", language: "turkish", genre: "pop", markets: ["TR"] },
  { name: "afrobeats", language: null, genre: "afrobeats", markets: ["NG", "US"] },
  { name: "amapiano", language: null, genre: "amapiano", markets: ["ZA"] },
  { name: "c-pop", language: "mandarin", genre: "c-pop", markets: ["TW"] },
  { name: "thai", language: "thai", genre: "pop", markets: ["TH"] },
  { name: "vietnamese", language: "vietnamese", genre: "pop", markets: ["VN"] },
  { name: "opm", language: "filipino", genre: "pop", markets: ["PH"] },
];

function languageSources(): SourceDef[] {
  const out: SourceDef[] = [];
  for (const d of LANGUAGE_DEFS) {
    const base = { language: d.language, genre_family: d.genre, instrumental: false };
    out.push(
      {
        query: `best ${d.name} songs`,
        markets: d.markets,
        category: "language",
        hints: { ...base },
      },
      {
        query: `${d.name} sad songs`,
        markets: d.markets,
        category: "language",
        hints: { ...base, valence: "negative", energy: "low", context_tags: ["heartbreak"] },
      },
      {
        query: `${d.name} party hits`,
        markets: d.markets,
        category: "language",
        hints: { ...base, valence: "positive", energy: "high", context_tags: ["party", "dance"] },
      },
      {
        query: `${d.name} romantic songs`,
        markets: d.markets,
        category: "language",
        hints: { ...base, valence: "positive", context_tags: ["romance"] },
      },
    );
  }
  return out;
}

const EN = { language: "english", instrumental: false } as const;
const US = ["US", "GB"];

const MOOD_SOURCES: SourceDef[] = [
  { query: "sad songs", markets: US, category: "mood", hints: { ...EN, valence: "negative", energy: "low", context_tags: ["heartbreak"] } },
  { query: "happy songs", markets: US, category: "mood", hints: { ...EN, valence: "positive", energy: "high" } },
  { query: "heartbreak songs", markets: US, category: "mood", hints: { ...EN, valence: "negative", energy: "low", context_tags: ["breakup", "heartbreak"] } },
  { query: "love songs", markets: US, category: "mood", hints: { ...EN, valence: "positive", context_tags: ["romance"] } },
  { query: "chill vibes", markets: US, category: "mood", hints: { ...EN, valence: "neutral", energy: "low", context_tags: ["chill"] } },
  { query: "feel good hits", markets: US, category: "mood", hints: { ...EN, valence: "positive", energy: "high" } },
  { query: "angry songs", markets: US, category: "mood", hints: { ...EN, valence: "negative", energy: "high" } },
  { query: "motivational songs", markets: US, category: "mood", hints: { ...EN, valence: "positive", energy: "high", context_tags: ["motivation"] } },
  { query: "nostalgic hits", markets: US, category: "mood", hints: { ...EN, context_tags: ["nostalgia"] } },
  { query: "party anthems", markets: US, category: "mood", hints: { ...EN, valence: "positive", energy: "high", context_tags: ["party", "dance"] } },
  { query: "summer hits", markets: US, category: "mood", hints: { ...EN, valence: "positive", energy: "high", context_tags: ["summer"] } },
  { query: "rainy day songs", markets: US, category: "mood", hints: { ...EN, energy: "low", context_tags: ["rain", "chill"] } },
  { query: "songs for crying", markets: US, category: "mood", hints: { ...EN, valence: "negative", energy: "low", context_tags: ["heartbreak"] } },
  { query: "hype songs", markets: US, category: "mood", hints: { ...EN, valence: "positive", energy: "high", context_tags: ["motivation", "workout"] } },
];

const ACTIVITY_SOURCES: SourceDef[] = [
  { query: "gym workout songs", markets: US, category: "activity", hints: { ...EN, energy: "high", context_tags: ["workout"] } },
  { query: "running songs", markets: US, category: "activity", hints: { ...EN, energy: "high", context_tags: ["running", "workout"] } },
  { query: "road trip songs", markets: US, category: "activity", hints: { ...EN, valence: "positive", context_tags: ["road-trip", "driving"] } },
  { query: "wedding songs", markets: US, category: "activity", hints: { ...EN, valence: "positive", context_tags: ["wedding", "romance"] } },
  { query: "calm sleep songs", markets: US, category: "activity", hints: { energy: "low", context_tags: ["sleep"] } },
  { query: "gaming music", markets: US, category: "activity", hints: { energy: "high", context_tags: ["gaming"] } },
  { query: "dinner party music", markets: US, category: "activity", hints: { ...EN, energy: "medium", context_tags: ["cooking", "chill"] } },
  { query: "songs to dance to", markets: US, category: "activity", hints: { ...EN, valence: "positive", energy: "high", context_tags: ["dance", "party"] } },
];

const GENRE_SOURCES: SourceDef[] = [
  { query: "pop hits", markets: US, category: "genre", hints: { ...EN, genre_family: "pop" } },
  { query: "classic rock songs", markets: US, category: "genre", hints: { ...EN, genre_family: "rock", context_tags: ["nostalgia"] } },
  { query: "rock anthems", markets: US, category: "genre", hints: { ...EN, genre_family: "rock", energy: "high" } },
  { query: "metal songs", markets: US, category: "genre", hints: { ...EN, genre_family: "metal", energy: "high" } },
  { query: "rap hits", markets: US, category: "genre", hints: { ...EN, genre_family: "hip-hop" } },
  { query: "hip hop classics", markets: US, category: "genre", hints: { ...EN, genre_family: "hip-hop", context_tags: ["nostalgia"] } },
  { query: "rnb songs", markets: US, category: "genre", hints: { ...EN, genre_family: "r&b" } },
  { query: "edm bangers", markets: US, category: "genre", hints: { genre_family: "electronic", energy: "high", context_tags: ["party", "dance"] } },
  { query: "house music", markets: US, category: "genre", hints: { genre_family: "house", energy: "high", context_tags: ["dance"] } },
  { query: "techno", markets: ["DE", "US"], category: "genre", hints: { genre_family: "techno", energy: "high", context_tags: ["dance"] } },
  { query: "smooth jazz", markets: US, category: "genre", hints: { genre_family: "jazz", energy: "low", context_tags: ["chill"] } },
  { query: "blues songs", markets: US, category: "genre", hints: { ...EN, genre_family: "blues" } },
  { query: "country hits", markets: US, category: "genre", hints: { ...EN, genre_family: "country" } },
  { query: "reggae songs", markets: US, category: "genre", hints: { ...EN, genre_family: "reggae", energy: "medium", context_tags: ["chill"] } },
  { query: "reggaeton hits", markets: ["MX", "US"], category: "genre", hints: { language: "spanish", genre_family: "reggaeton", energy: "high", context_tags: ["party", "dance"] } },
  { query: "gospel worship songs", markets: US, category: "genre", hints: { ...EN, genre_family: "gospel", valence: "positive", context_tags: ["devotional"] } },
  { query: "funk songs", markets: US, category: "genre", hints: { ...EN, genre_family: "funk", energy: "high" } },
  { query: "disco hits", markets: US, category: "genre", hints: { ...EN, genre_family: "disco", energy: "high", context_tags: ["party", "dance", "nostalgia"] } },
  { query: "indie songs", markets: US, category: "genre", hints: { ...EN, genre_family: "indie" } },
  { query: "folk acoustic songs", markets: US, category: "genre", hints: { ...EN, genre_family: "folk", energy: "low", context_tags: ["chill"] } },
  { query: "phonk", markets: US, category: "genre", hints: { genre_family: "phonk", energy: "high", context_tags: ["gaming", "workout"] } },
];

const INSTRUMENTAL_SOURCES: SourceDef[] = [
  { query: "peaceful piano instrumental", markets: US, category: "instrumental", hints: { language: null, genre_family: "classical", energy: "low", valence: "neutral", instrumental: true, context_tags: ["study", "sleep", "chill"] } },
  { query: "instrumental study music", markets: US, category: "instrumental", hints: { instrumental: true, energy: "low", context_tags: ["study", "focus"] } },
  { query: "lofi beats", markets: US, category: "instrumental", hints: { genre_family: "lofi", instrumental: true, energy: "low", context_tags: ["study", "chill"] } },
  { query: "ambient music", markets: US, category: "instrumental", hints: { genre_family: "ambient", instrumental: true, energy: "low", context_tags: ["sleep", "meditation"] } },
  { query: "epic orchestral music", markets: US, category: "instrumental", hints: { genre_family: "soundtrack", instrumental: true, energy: "high" } },
  { query: "movie soundtrack instrumental", markets: US, category: "instrumental", hints: { genre_family: "soundtrack", instrumental: true } },
  { query: "jazz instrumental", markets: US, category: "instrumental", hints: { genre_family: "jazz", instrumental: true, energy: "low", context_tags: ["chill", "cooking"] } },
  { query: "classical music", markets: US, category: "instrumental", hints: { genre_family: "classical", instrumental: true } },
  { query: "meditation music", markets: US, category: "instrumental", hints: { instrumental: true, energy: "low", context_tags: ["meditation", "sleep"] } },
  { query: "video game music", markets: US, category: "instrumental", hints: { genre_family: "soundtrack", instrumental: true, context_tags: ["gaming"] } },
];

const ERA_SOURCES: SourceDef[] = [
  { query: "80s hits", markets: US, category: "era", hints: { ...EN, context_tags: ["nostalgia"] } },
  { query: "90s hits", markets: US, category: "era", hints: { ...EN, context_tags: ["nostalgia"] } },
  { query: "2000s hits", markets: US, category: "era", hints: { ...EN, context_tags: ["nostalgia"] } },
  { query: "2010s hits", markets: US, category: "era", hints: { ...EN, context_tags: ["nostalgia"] } },
];

const EXTRA_SOURCES: SourceDef[] = [
  { query: "bollywood 90s songs", markets: ["IN"], category: "era", hints: { language: "hindi", genre_family: "bollywood", instrumental: false, context_tags: ["nostalgia"] } },
  { query: "punjabi bhangra songs", markets: ["IN"], category: "genre", hints: { language: "punjabi", genre_family: "punjabi-pop", energy: "high", instrumental: false, context_tags: ["party", "dance", "festival"] } },
  { query: "hindi devotional songs", markets: ["IN"], category: "mood", hints: { language: "hindi", instrumental: false, context_tags: ["devotional"] } },
  { query: "sufi songs", markets: ["IN"], category: "genre", hints: { language: "hindi", instrumental: false, context_tags: ["devotional"] } },
  { query: "bollywood workout songs", markets: ["IN"], category: "activity", hints: { language: "hindi", genre_family: "bollywood", energy: "high", instrumental: false, context_tags: ["workout"] } },
  { query: "anime opening songs", markets: ["JP", "US"], category: "genre", hints: { language: "japanese", genre_family: "j-pop", energy: "high", instrumental: false, context_tags: ["gaming"] } },
  { query: "monsoon songs hindi", markets: ["IN"], category: "mood", hints: { language: "hindi", genre_family: "bollywood", instrumental: false, context_tags: ["rain", "monsoon", "romance"] } },
  { query: "tamil kuthu songs", markets: ["IN"], category: "genre", hints: { language: "tamil", genre_family: "south-indian", energy: "high", instrumental: false, context_tags: ["party", "dance"] } },
  { query: "k-drama ost", markets: ["KR", "US"], category: "genre", hints: { language: "korean", genre_family: "soundtrack", energy: "low", instrumental: false, context_tags: ["romance"] } },
  { query: "christmas songs", markets: US, category: "mood", hints: { ...EN, valence: "positive", context_tags: ["winter", "festival"] } },
];

export const SOURCE_DEFS: SourceDef[] = [
  ...languageSources(),
  ...MOOD_SOURCES,
  ...ACTIVITY_SOURCES,
  ...GENRE_SOURCES,
  ...INSTRUMENTAL_SOURCES,
  ...ERA_SOURCES,
  ...EXTRA_SOURCES,
];
