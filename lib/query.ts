// The v2 matching engine: turns the user's tags + free text into axis
// preferences, scores the pre-built track index against them in one SQL
// query, and shapes the ranked result. This replaces v1's live
// search+lyrics pipeline — no external API is touched at query time.
import { db } from "@/lib/db";
import { NRC_DIMENSIONS, scoreText, type EmotionVector, type NrcDimension } from "@/lib/nrc";

export interface QueryPrefs {
  languages: string[];
  genres: string[];
  energy: "high" | "medium" | "low" | null;
  valence: "positive" | "negative" | "neutral" | null;
  contexts: string[];
  instrumentalOnly: boolean;
}

export interface RankedTrack {
  id: string;
  uri: string;
  name: string;
  artists: string[];
  albumArt: string | null;
  confidence: number;
  reason: string;
  tags: {
    language: string | null;
    genre: string | null;
    energy: string | null;
    valence: string | null;
    instrumental: boolean | null;
    contexts: string[];
  };
}

interface Prefs {
  languages?: string[];
  genres?: string[];
  energy?: "high" | "medium" | "low";
  valence?: "positive" | "negative" | "neutral";
  contexts?: string[];
  instrumental?: boolean;
}

/** v1 tag-chip ids → v2 index axes. */
const TAG_PREFS: Record<string, Prefs> = {
  // moods
  happy: { valence: "positive" },
  chill: { energy: "low", contexts: ["chill"] },
  euphoric: { valence: "positive", energy: "high" },
  melancholy: { valence: "negative", energy: "low" },
  lonely: { valence: "negative", energy: "low", contexts: ["heartbreak"] },
  angry: { valence: "negative", energy: "high" },
  rebellious: { valence: "negative", energy: "high", genres: ["rock", "metal", "phonk"] },
  romantic: { valence: "positive", contexts: ["romance"] },
  sensual: { valence: "positive", energy: "low", contexts: ["romance"] },
  nostalgic: { contexts: ["nostalgia"] },
  hype: { valence: "positive", energy: "high", contexts: ["motivation", "workout"] },
  playful: { valence: "positive", energy: "medium" },
  dreamy: { energy: "low", contexts: ["chill"], genres: ["ambient", "lofi"] },
  peaceful: { energy: "low", valence: "neutral", contexts: ["meditation", "chill"] },
  mysterious: { energy: "low", genres: ["ambient", "soundtrack"] },
  epic: { energy: "high", genres: ["soundtrack"] },
  gritty: { energy: "high", valence: "negative", genres: ["rock", "hip-hop"] },
  spooky: { valence: "negative", energy: "low", genres: ["soundtrack", "ambient"] },
  hopeful: { valence: "positive" },
  anxious: { valence: "negative" },
  empowered: { valence: "positive", energy: "high", contexts: ["motivation"] },
  grateful: { valence: "positive" },
  // activities
  workout: { contexts: ["workout", "running"], energy: "high" },
  study: { contexts: ["study", "focus"], energy: "low" },
  driving: { contexts: ["driving", "road-trip"] },
  sleep: { contexts: ["sleep"], energy: "low" },
  party: { contexts: ["party", "dance"], energy: "high", valence: "positive" },
  festival: { contexts: ["festival", "party"], energy: "high" },
  focus: { contexts: ["focus", "study"], energy: "low" },
  gaming: { contexts: ["gaming"], energy: "high" },
  heartbreak: { contexts: ["heartbreak", "breakup"], valence: "negative", energy: "low" },
  wedding: { contexts: ["wedding", "romance"], valence: "positive" },
  morning: { valence: "positive", energy: "medium" },
  "late-night": { energy: "low", contexts: ["chill"] },
  "rainy-day": { contexts: ["rain", "monsoon"], energy: "low" },
  beach: { contexts: ["summer"], valence: "positive" },
  travel: { contexts: ["road-trip", "driving"] },
  cooking: { contexts: ["cooking", "chill"] },
  meditation: { contexts: ["meditation"], energy: "low", instrumental: true },
  "getting-ready": { valence: "positive", energy: "high", contexts: ["party"] },
  summer: { contexts: ["summer"], valence: "positive" },
  winter: { contexts: ["winter"] },
  // genres
  pop: { genres: ["pop"] },
  "hip-hop": { genres: ["hip-hop"] },
  indie: { genres: ["indie"] },
  rnb: { genres: ["r&b"] },
  electronic: { genres: ["electronic", "house", "techno"] },
  rock: { genres: ["rock"] },
  metal: { genres: ["metal"] },
  jazz: { genres: ["jazz"] },
  blues: { genres: ["blues"] },
  classical: { genres: ["classical"] },
  lofi: { genres: ["lofi"] },
  country: { genres: ["country"] },
  folk: { genres: ["folk"] },
  latin: { genres: ["latin", "reggaeton"], languages: ["spanish", "portuguese"] },
  afrobeats: { genres: ["afrobeats", "amapiano"] },
  reggae: { genres: ["reggae"] },
  bollywood: { genres: ["bollywood"], languages: ["hindi"] },
  punjabi: { genres: ["punjabi-pop"], languages: ["punjabi"] },
  "south-indian": { genres: ["south-indian"], languages: ["tamil", "telugu"] },
  kpop: { genres: ["k-pop"], languages: ["korean"] },
  "jpop-anime": { genres: ["j-pop"], languages: ["japanese"] },
  arabic: { genres: ["arabic-pop"], languages: ["arabic"] },
  "funk-disco": { genres: ["funk", "disco"] },
  techno: { genres: ["techno", "house"] },
  phonk: { genres: ["phonk"] },
  gospel: { genres: ["gospel"], contexts: ["devotional"] },
};

/** Free-text keywords → axis preferences (checked as whole words). */
const TEXT_KEYWORDS: [RegExp, Prefs][] = [
  [/\b(hindi|bollywood)\b/, { languages: ["hindi"], genres: ["bollywood"] }],
  [/\bpunjabi\b/, { languages: ["punjabi"], genres: ["punjabi-pop"] }],
  [/\btamil\b/, { languages: ["tamil"], genres: ["south-indian"] }],
  [/\btelugu\b/, { languages: ["telugu"], genres: ["south-indian"] }],
  [/\b(korean|k[- ]?pop)\b/, { languages: ["korean"], genres: ["k-pop"] }],
  [/\b(japanese|j[- ]?pop|anime)\b/, { languages: ["japanese"], genres: ["j-pop"] }],
  [/\b(spanish|latin|latino)\b/, { languages: ["spanish"], genres: ["latin", "reggaeton"] }],
  [/\b(portuguese|brazilian|brazil)\b/, { languages: ["portuguese"], genres: ["latin"] }],
  [/\barabic\b/, { languages: ["arabic"], genres: ["arabic-pop"] }],
  [/\bfrench\b/, { languages: ["french"] }],
  [/\bgerman\b/, { languages: ["german"] }],
  [/\bitalian\b/, { languages: ["italian"] }],
  [/\b(mandarin|chinese|c[- ]?pop)\b/, { languages: ["mandarin"], genres: ["c-pop"] }],
  [/\b(turkish)\b/, { languages: ["turkish"] }],
  [/\b(indonesian)\b/, { languages: ["indonesian"] }],
  [/\b(thai)\b/, { languages: ["thai"] }],
  [/\b(vietnamese)\b/, { languages: ["vietnamese"] }],
  [/\b(filipino|opm|tagalog)\b/, { languages: ["filipino"] }],
  [/\bafrobeats?\b/, { genres: ["afrobeats"] }],
  [/\bamapiano\b/, { genres: ["amapiano"] }],
  [/\b(instrumental|no vocals|without vocals)\b/, { instrumental: true }],
  [/\b(piano|orchestral|orchestra)\b/, { instrumental: true, genres: ["classical", "soundtrack"] }],
  [/\blo-?fi\b/, { genres: ["lofi"], instrumental: true }],
  [/\b(workout|gym|exercise)\b/, { contexts: ["workout"], energy: "high" }],
  [/\b(run|running|jog)\b/, { contexts: ["running", "workout"], energy: "high" }],
  [/\b(study|studying|focus|concentrate)\b/, { contexts: ["study", "focus"], energy: "low" }],
  [/\bsleep\w*\b/, { contexts: ["sleep"], energy: "low" }],
  [/\b(party|club|clubbing)\b/, { contexts: ["party", "dance"], energy: "high", valence: "positive" }],
  [/\bdanc\w+\b/, { contexts: ["dance", "party"], energy: "high" }],
  [/\b(drive|driving|road ?trip)\b/, { contexts: ["driving", "road-trip"] }],
  [/\bwedding\b/, { contexts: ["wedding", "romance"], valence: "positive" }],
  [/\b(breakup|break[- ]up|heartbreak|heartbroken|ex)\b/, { contexts: ["heartbreak", "breakup"], valence: "negative", energy: "low" }],
  [/\b(rain|rainy|monsoon)\b/, { contexts: ["rain", "monsoon"], energy: "low" }],
  [/\b(gaming|game|videogame)\b/, { contexts: ["gaming"] }],
  [/\b(cook|cooking|dinner)\b/, { contexts: ["cooking", "chill"] }],
  [/\b(meditat\w+|yoga)\b/, { contexts: ["meditation"], energy: "low" }],
  [/\b(motivat\w+|pump\w*|grind)\b/, { contexts: ["motivation"], energy: "high", valence: "positive" }],
  [/\b(nostalgi\w+|throwback|old songs)\b/, { contexts: ["nostalgia"] }],
  [/\b(christmas|holiday)\b/, { contexts: ["winter", "festival"] }],
  [/\bsummer\b/, { contexts: ["summer"] }],
  [/\b(devotional|worship|bhajan|sufi)\b/, { contexts: ["devotional"] }],
  [/\b(highbeat|high beat|upbeat|energetic|hype)\b/, { energy: "high", valence: "positive" }],
  [/\b(slow|calm|soft|mellow|chill)\b/, { energy: "low" }],
];

const POSITIVE_DIMS: NrcDimension[] = ["joy", "positive", "trust"];
const NEGATIVE_DIMS: NrcDimension[] = ["sadness", "negative", "fear", "anger", "disgust"];

// EmotionVector is positional (aligned with NRC_DIMENSIONS)
const dimOf = (v: EmotionVector, d: NrcDimension) => v[NRC_DIMENSIONS.indexOf(d)] ?? 0;

/** Merge tag chips + free text (keywords, then NRC emotion fallback) into one preference set. */
export function buildPrefs(text: string, tagIds: string[], instrumentalToggle: boolean): QueryPrefs {
  const merged: Required<Prefs> = { languages: [], genres: [], energy: undefined as never, valence: undefined as never, contexts: [], instrumental: undefined as never };
  const energies: string[] = [];
  const valences: string[] = [];

  const apply = (p: Prefs) => {
    for (const l of p.languages ?? []) if (!merged.languages.includes(l)) merged.languages.push(l);
    for (const g of p.genres ?? []) if (!merged.genres.includes(g)) merged.genres.push(g);
    for (const c of p.contexts ?? []) if (!merged.contexts.includes(c)) merged.contexts.push(c);
    if (p.energy) energies.push(p.energy);
    if (p.valence) valences.push(p.valence);
    if (p.instrumental) merged.instrumental = true;
  };

  for (const id of tagIds) if (TAG_PREFS[id]) apply(TAG_PREFS[id]);

  const lower = text.toLowerCase();
  for (const [re, prefs] of TEXT_KEYWORDS) if (re.test(lower)) apply(prefs);

  // NRC emotion reading of the free text fills valence/energy gaps from
  // feeling words the keyword table doesn't cover ("missing someone, hopeful").
  if (text.trim() && (energies.length === 0 || valences.length === 0)) {
    const { vector, hits } = scoreText(text);
    if (hits > 0) {
      const pos = POSITIVE_DIMS.reduce((s, d) => s + dimOf(vector, d), 0);
      const neg = NEGATIVE_DIMS.reduce((s, d) => s + dimOf(vector, d), 0);
      if (valences.length === 0 && Math.abs(pos - neg) > 0.05) {
        valences.push(pos > neg ? "positive" : "negative");
      }
      if (energies.length === 0) {
        const high =
          dimOf(vector, "anger") + dimOf(vector, "joy") + dimOf(vector, "anticipation") + dimOf(vector, "surprise");
        const low = dimOf(vector, "sadness") + dimOf(vector, "trust");
        if (Math.abs(high - low) > 0.08) energies.push(high > low ? "high" : "low");
      }
    }
  }

  const majority = <T extends string>(arr: T[]): T | null => {
    if (arr.length === 0) return null;
    const counts = new Map<T, number>();
    for (const v of arr) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };

  return {
    languages: merged.languages,
    genres: merged.genres,
    energy: majority(energies) as QueryPrefs["energy"],
    valence: majority(valences) as QueryPrefs["valence"],
    contexts: merged.contexts,
    instrumentalOnly: instrumentalToggle || merged.instrumental === true,
  };
}

const MAX_PER_ARTIST = 3;

/** Normalized "same song" key: primary artist + title stripped of (...) [...] and " - ..." suffixes. */
function versionKey(name: string, primaryArtist: string): string {
  const base = name
    .toLowerCase()
    .replace(/\s*[([].*?[)\]]/g, "")
    .replace(/\s+-\s+.*$/, "")
    .trim();
  return `${primaryArtist.toLowerCase()}|${base}`;
}

/** Score the index against prefs and return the top `size` tracks, artist-capped. */
export async function queryIndex(prefs: QueryPrefs, size: number): Promise<RankedTrack[]> {
  const { rows } = await db().query(
    `
    SELECT t.id, t.name, t.artists, t.album_art, t.language, t.genre_family,
           t.energy, t.valence, t.instrumental, t.context_tags, t.confidence,
           t.confidence_source,
           (
             (CASE WHEN cardinality($1::text[]) > 0 AND t.language = ANY($1) THEN 30 ELSE 0 END
            + CASE WHEN cardinality($2::text[]) > 0 AND t.genre_family = ANY($2) THEN 25 ELSE 0 END
            + CASE WHEN $3::text IS NOT NULL AND t.valence = $3 THEN 20 ELSE 0 END
            + CASE WHEN $4::text IS NOT NULL AND t.energy = $4 THEN 15 ELSE 0 END
            + LEAST(cardinality(ARRAY(SELECT unnest(t.context_tags) INTERSECT SELECT unnest($5::text[]))) * 8, 24)
             ) * coalesce(t.confidence, 0.5)
            + ps.pop
            + random() * 3
           ) AS score
    FROM tracks t
    JOIN LATERAL (
      SELECT LEAST(count(*), 6) * 2 + (100 - LEAST(min(ts.best_rank), 100)) / 12.0 AS pop
      FROM track_sources ts WHERE ts.track_id = t.id
    ) ps ON true
    WHERE t.status = 'tagged'
      AND ($6::boolean = false OR t.instrumental = true)
    ORDER BY score DESC
    LIMIT 250
    `,
    [prefs.languages, prefs.genres, prefs.valence, prefs.energy, prefs.contexts, prefs.instrumentalOnly]
  );

  const perArtist = new Map<string, number>();
  const seenVersions = new Set<string>();
  const out: RankedTrack[] = [];
  for (const r of rows) {
    if (out.length >= size) break;
    const artists = (r.artists as { name: string }[]).map((a) => a.name);
    // Re-releases of the same song (deluxe albums, singles vs. album cuts)
    // exist as distinct track ids — keep only the highest-scored copy.
    const vKey = versionKey(r.name, artists[0] ?? "?");
    if (seenVersions.has(vKey)) continue;
    seenVersions.add(vKey);
    const key = artists[0]?.toLowerCase() ?? "?";
    const seen = perArtist.get(key) ?? 0;
    if (seen >= MAX_PER_ARTIST) continue;
    perArtist.set(key, seen + 1);
    out.push({
      id: r.id,
      uri: `spotify:track:${r.id}`,
      name: r.name,
      artists,
      albumArt: r.album_art,
      confidence: r.confidence ?? 0.5,
      reason: describe(r, prefs),
      tags: {
        language: r.language,
        genre: r.genre_family,
        energy: r.energy,
        valence: r.valence,
        instrumental: r.instrumental,
        contexts: r.context_tags ?? [],
      },
    });
  }
  return out;
}

function describe(
  r: {
    language: string | null;
    genre_family: string | null;
    energy: string | null;
    valence: string | null;
    instrumental: boolean | null;
    context_tags: string[] | null;
    confidence_source: string;
  },
  prefs: QueryPrefs
): string {
  const matched: string[] = [];
  if (r.language && prefs.languages.includes(r.language)) matched.push(r.language);
  if (r.genre_family && prefs.genres.includes(r.genre_family)) matched.push(r.genre_family);
  if (r.valence && r.valence === prefs.valence) matched.push(`${r.valence} mood`);
  if (r.energy && r.energy === prefs.energy) matched.push(`${r.energy} energy`);
  const ctx = (r.context_tags ?? []).filter((c) => prefs.contexts.includes(c));
  if (ctx.length) matched.push(ctx.join(", "));
  if (r.instrumental && prefs.instrumentalOnly) matched.push("instrumental");
  const how = r.confidence_source === "llm_escalated" ? "AI-classified" : "cross-playlist agreement";
  if (matched.length === 0) {
    return `Popular in the index — no direct axis match, ranked by popularity (tagged via ${how}).`;
  }
  return `Matched ${matched.join(" · ")} — tagged via ${how}.`;
}
