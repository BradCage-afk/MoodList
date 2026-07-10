import type { NrcDimension } from "@/lib/nrc";

export type TagAxis = "mood" | "activity" | "genre";

export interface Tag {
  id: string;
  label: string;
  axis: TagAxis;
  /** Keywords mixed into Spotify search queries. */
  searchSeeds: string[];
  /**
   * Target emotion profile in NRC space (relative weights, normalized later).
   * Genre tags mostly steer search, so many have light or no emotion targets.
   */
  targetWeights: Partial<Record<NrcDimension, number>>;
}

export const TAGS: Tag[] = [
  // ── Mood / emotion ────────────────────────────────────────────────
  {
    id: "chill",
    label: "Chill",
    axis: "mood",
    searchSeeds: ["chill", "mellow", "laid back", "smooth"],
    targetWeights: { trust: 2, positive: 2, joy: 1, anticipation: 0.5 },
  },
  {
    id: "euphoric",
    label: "Euphoric",
    axis: "mood",
    searchSeeds: ["euphoric", "feel good", "uplifting", "ecstatic"],
    targetWeights: { joy: 3, positive: 2, surprise: 1, anticipation: 1 },
  },
  {
    id: "melancholy",
    label: "Melancholy",
    axis: "mood",
    searchSeeds: ["melancholy", "sad", "bittersweet", "blue"],
    targetWeights: { sadness: 3, negative: 1.5, fear: 0.5 },
  },
  {
    id: "angry",
    label: "Angry",
    axis: "mood",
    searchSeeds: ["angry", "rage", "furious", "aggressive"],
    targetWeights: { anger: 3, negative: 2, disgust: 1 },
  },
  {
    id: "romantic",
    label: "Romantic",
    axis: "mood",
    searchSeeds: ["love song", "romantic", "falling in love"],
    targetWeights: { joy: 2, trust: 2, positive: 2, anticipation: 1 },
  },
  {
    id: "nostalgic",
    label: "Nostalgic",
    axis: "mood",
    searchSeeds: ["nostalgia", "memories", "throwback", "old days"],
    targetWeights: { sadness: 1.5, joy: 1.5, trust: 1, positive: 1 },
  },
  {
    id: "hype",
    label: "Hype",
    axis: "mood",
    searchSeeds: ["hype", "pump up", "banger", "turn up"],
    targetWeights: { anticipation: 2.5, joy: 2, positive: 1.5, surprise: 1 },
  },
  {
    id: "dreamy",
    label: "Dreamy",
    axis: "mood",
    searchSeeds: ["dreamy", "ethereal", "atmospheric", "floating"],
    targetWeights: { anticipation: 2, joy: 1.5, trust: 1, positive: 1, surprise: 0.5 },
  },
  {
    id: "gritty",
    label: "Gritty",
    axis: "mood",
    searchSeeds: ["gritty", "dark", "raw", "dirty"],
    targetWeights: { anger: 2, fear: 1.5, negative: 1.5, disgust: 1 },
  },
  {
    id: "hopeful",
    label: "Hopeful",
    axis: "mood",
    searchSeeds: ["hopeful", "optimistic", "rise up", "brighter days"],
    targetWeights: { anticipation: 2.5, trust: 2, positive: 2, joy: 1.5 },
  },
  {
    id: "anxious",
    label: "Anxious",
    axis: "mood",
    searchSeeds: ["anxious", "restless", "paranoid", "tension"],
    targetWeights: { fear: 3, anticipation: 1.5, negative: 1.5 },
  },
  {
    id: "empowered",
    label: "Empowered",
    axis: "mood",
    searchSeeds: ["empowerment", "confident", "boss", "unstoppable"],
    targetWeights: { trust: 2, positive: 2, joy: 1.5, anger: 0.5, anticipation: 1 },
  },

  // ── Activity / context ────────────────────────────────────────────
  {
    id: "workout",
    label: "Workout",
    axis: "activity",
    searchSeeds: ["workout", "gym", "running", "beast mode"],
    targetWeights: { anticipation: 2, joy: 1.5, positive: 1.5, anger: 0.5 },
  },
  {
    id: "study",
    label: "Study",
    axis: "activity",
    searchSeeds: ["study", "concentration", "instrumental focus", "deep focus"],
    targetWeights: { trust: 2, positive: 1, anticipation: 1 },
  },
  {
    id: "driving",
    label: "Driving",
    axis: "activity",
    searchSeeds: ["road trip", "driving", "highway", "cruising"],
    targetWeights: { joy: 2, anticipation: 2, positive: 1.5 },
  },
  {
    id: "sleep",
    label: "Sleep",
    axis: "activity",
    searchSeeds: ["sleep", "calm night", "lullaby", "ambient sleep"],
    targetWeights: { trust: 2.5, positive: 1.5 },
  },
  {
    id: "party",
    label: "Party",
    axis: "activity",
    searchSeeds: ["party", "dance floor", "club", "celebration"],
    targetWeights: { joy: 3, positive: 2, surprise: 1, anticipation: 1.5 },
  },
  {
    id: "focus",
    label: "Focus",
    axis: "activity",
    searchSeeds: ["focus", "flow state", "productivity", "in the zone"],
    targetWeights: { trust: 2, anticipation: 1.5, positive: 1 },
  },
  {
    id: "heartbreak",
    label: "Heartbreak",
    axis: "activity",
    searchSeeds: ["heartbreak", "breakup", "missing you", "moving on"],
    targetWeights: { sadness: 3, negative: 1.5, fear: 0.5, anger: 0.5 },
  },
  {
    id: "morning",
    label: "Morning",
    axis: "activity",
    searchSeeds: ["morning", "sunrise", "wake up", "coffee"],
    targetWeights: { joy: 2, anticipation: 2, positive: 2, trust: 1 },
  },
  {
    id: "late-night",
    label: "Late Night",
    axis: "activity",
    searchSeeds: ["late night", "midnight", "after hours", "3am"],
    targetWeights: { sadness: 1.5, anticipation: 1.5, fear: 0.5, trust: 1 },
  },
  {
    id: "rainy-day",
    label: "Rainy Day",
    axis: "activity",
    searchSeeds: ["rainy day", "rain", "cozy", "grey skies"],
    targetWeights: { sadness: 2, trust: 1.5, positive: 1 },
  },

  // ── Genre (optional refinement) ───────────────────────────────────
  { id: "pop", label: "Pop", axis: "genre", searchSeeds: ["pop hits", "pop"], targetWeights: {} },
  { id: "hip-hop", label: "Hip-Hop", axis: "genre", searchSeeds: ["hip hop", "rap"], targetWeights: {} },
  { id: "indie", label: "Indie", axis: "genre", searchSeeds: ["indie", "indie rock", "indie pop"], targetWeights: {} },
  { id: "rnb", label: "R&B", axis: "genre", searchSeeds: ["r&b", "rnb", "soul"], targetWeights: {} },
  { id: "electronic", label: "Electronic", axis: "genre", searchSeeds: ["electronic", "edm", "house"], targetWeights: {} },
  { id: "rock", label: "Rock", axis: "genre", searchSeeds: ["rock", "alternative rock"], targetWeights: {} },
  { id: "jazz", label: "Jazz", axis: "genre", searchSeeds: ["jazz", "jazz standards"], targetWeights: {} },
  { id: "lofi", label: "Lo-fi", axis: "genre", searchSeeds: ["lofi", "lo-fi beats", "chillhop"], targetWeights: {} },
  { id: "country", label: "Country", axis: "genre", searchSeeds: ["country", "country hits"], targetWeights: {} },
  { id: "latin", label: "Latin", axis: "genre", searchSeeds: ["latin", "reggaeton"], targetWeights: {} },
];

export const TAGS_BY_ID = new Map(TAGS.map((t) => [t.id, t]));

export const AXES: { axis: TagAxis; title: string }[] = [
  { axis: "mood", title: "Mood" },
  { axis: "activity", title: "Activity" },
  { axis: "genre", title: "Genre" },
];
