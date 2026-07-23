# Project: Moodlist — Pre-Indexed Multilingual Mood-to-Spotify-Playlist Curator

## Objective
A web app where a user types free text and/or selects tag chips describing a mood, and instantly gets a curated playlist of real, mainstream, multilingual (including instrumental) Spotify tracks matching that mood — exportable to their Spotify account in one click. Matching is powered by a **pre-built, offline-indexed track database** (not live-per-request search/scoring), so queries are fast and results are accurate rather than keyword-fragile.

This project has TWO separate systems that must stay architecturally decoupled:
1. **Offline indexing pipeline** — a standalone script (NOT a Vercel API route — it will run far longer than serverless timeout limits allow) that builds a tagged track database, run once up front (and re-runnable/resumable).
2. **Live web app** — a Next.js app on Vercel that queries the pre-built database instantly and handles Spotify OAuth + playlist export live.

Do not conflate these two. The indexing pipeline must never be triggered by a user request in the deployed app.

## Hard constraints (do not deviate)
- Spotify's audio-features/audio-analysis endpoints are dead for new apps — never attempt to use them or rely on `preview_url` (unreliable/often null now).
- No live-per-request lyrics fetching or LLM scoring in the deployed web app — that all happens once, offline, during indexing.
- Never persist raw lyrics text anywhere, even temporarily in the DB — fetch, use for scoring/tagging, discard. Only derived structured tags get stored.
- Spotify's `GET /search` endpoint caps `limit` at 10 per request — plan pagination/many small requests accordingly.
- Playlist creation must use `POST /me/playlists` (current-user-only endpoint).
- The indexing script must be resumable/checkpointed — do not assume one uninterrupted run given realistic rate limits across thousands of tracks. Persist progress per track so a restart skips already-indexed tracks.

## Tech stack
- **Indexing pipeline**: Node.js/TypeScript standalone script(s), run locally or via a scheduled job — NOT deployed as a Vercel function.
- **Database**: Postgres (Vercel Postgres, Supabase, or Neon — pick one and note setup steps; needs to be reachable both from the local indexing script and the deployed Vercel app).
- **Web app**: Next.js 14+ (App Router), TypeScript, Tailwind, deployed on Vercel.
- **Auth**: NextAuth.js with Spotify provider (Authorization Code flow), scopes `playlist-modify-public playlist-modify-private`. Web search current NextAuth Spotify provider config before implementing, since NextAuth's API shifts across versions.
- **Tagging LLM**: Anthropic API (Claude Haiku model — this is a bounded structured-output classification task, does not need a larger model) for the two LLM-touching steps: (a) one-time playlist→tag map generation, (b) escalated per-track classification for low-confidence tracks only.
- **Lyrics** (escalation path only): Genius API for search, server-side fetch + parse of the lyrics page for internal scoring use only — never stored, never displayed.

## PART 1 — Offline Indexing Pipeline

### Step 1.1 — Source editorial playlists (not tracks yet)
Search Spotify's `GET /search?type=playlist` across a deliberately broad spread of:
- **Genre/language playlists**: e.g. Bollywood, Punjabi, Tamil, K-pop, Latin, Afrobeats, plus major Western genres.
- **Mood playlists**: e.g. Sad Bops, Mood Booster, Chill Vibes, Feelin' Myself, Heartbreak, Romance.
- **Activity playlists**: Workout, Study, Sleep, Party, Focus.
- **Instrumental-specific playlists**: e.g. Peaceful Piano, Instrumental Studying, Deep Focus — critical for representing instrumental tracks, which have no lyrics signal at all.
- Query across **multiple Spotify `market` codes** (not just US) since editorial playlists are region-locked — web search which market codes give the best coverage for South Asian, East Asian, Latin American, and African markets specifically.
- Exclude generic/non-signal playlists (e.g. "New Music Friday," "Today's Top Hits," "Editor's Picks") — these don't carry reliable genre/mood signal, they're just "popular now."
- Target roughly 150-300 curated playlists total, saved with their names/descriptions to a `playlists` table.

### Step 1.2 — Generate the playlist→tag map (one-time LLM pass, cheap)
For each sourced playlist, call Claude Haiku with the playlist's name + description and have it output a structured tag object:
```
{
  language: string | null,
  genre_family: string | null,
  energy: "high" | "medium" | "low" | null,
  valence: "positive" | "negative" | "neutral" | null,
  instrumental: boolean | null,
  context_tags: string[]
}
```
This is ~150-300 calls total, not per-track — cheap and fast. Save the output to a `playlist_tags` table. Log these outputs to a reviewable file/console output so the user can spot-check and manually correct any obviously wrong mappings before proceeding to Step 1.3 — pause and surface this for review rather than silently trusting every mapping.

### Step 1.3 — Collect tracks from playlists
For every sourced playlist, fetch its tracks (`GET /playlists/{id}/tracks`), storing: Spotify track ID, name, artist(s), album art URL, and which playlist(s) it came from. Also fetch each artist's `genres` field from `GET /artists/{id}` (free, no scraping) as an additional signal source. Target 10,000-20,000 unique tracks after dedup — if you fall short, source more playlists rather than lowering the bar, since catalog breadth (multilingual + instrumental coverage) is the core goal of this project.

### Step 1.4 — Confidence scoring (per track, rule-based, zero LLM calls)
For each track, aggregate tags across every playlist it belongs to plus its artists' Spotify genres, then compute:
- Per-axis agreement: `agreement = (playlists agreeing with majority value) / n` for single-value axes (language, genre_family, energy, valence); for `context_tags`, a tag is confirmed if present in ≥50% of the track's playlists.
- Coverage (penalizes thin data): `coverage = min(n / 3, 1)`
- Per-axis confidence: `confidence = agreement × coverage`
- Overall: `overall_confidence = 0.30×lang + 0.25×genre + 0.20×valence + 0.15×energy + 0.10×context_tags`

If `overall_confidence >= 0.75`: assign tags directly from the aggregated playlist/artist-genre data. No lyrics fetch, no LLM call for this track — ever.

If `overall_confidence < 0.75`: escalate to Step 1.5.

### Step 1.5 — Escalation path (ambiguous tracks only)
For escalated tracks only:
1. Search Genius for the track, fetch and parse the lyrics page server-side (skip gracefully if no match found or track is instrumental).
2. Call Claude Haiku with: the track's playlist memberships + their tag implications, the artist's Spotify genres, and the lyrics text if available. Prompt it to output the same structured tag schema, resolving the ambiguity using full context.
3. Discard the lyrics text immediately after the call completes. Store only the returned structured tags.

### Step 1.6 — Persist and checkpoint
Write final tags per track to a `tracks` table (Spotify track ID, metadata, tag columns, `confidence_source: "aggregated" | "llm_escalated"`). After every batch (e.g. every 100 tracks), checkpoint progress so the script can be safely stopped and resumed without re-processing completed tracks or re-spending LLM/API calls.

### Step 1.7 — Indexing summary
On completion (or if manually stopped), print a summary: total tracks indexed, % auto-tagged vs LLM-escalated, language/genre distribution, and any playlists/tracks that failed entirely.

## PART 2 — Live Web App

### Step 2.1 — Input UI
Text input + tag chips (Refero-style), organized by axis categories mirroring the tag schema (mood, activity, language/genre, instrumental toggle). Combine into one query on submit.

### Step 2.2 — Query the pre-built index
On submit, run a query against the `tracks` table matching/ranking by the stored tags against the user's combined text+tag input (simple weighted scoring against stored structured columns — this should be near-instant, it's a DB query, not live scoring). Apply artist diversity capping (max 2-3 tracks per artist) in the result set. Return top ~20-25 tracks.

### Step 2.3 — Loading state
Since this query is now fast (DB lookup, not live multi-step scoring), keep the loading state brief and light — a simple elegant animation (translucent pulsing vinyl/playlist-cover graphic, no fake staged progress text since there are no real slow stages here anymore). Reserve any more elaborate multi-stage progress messaging for Step 2.4 below, where a genuinely slower live process does occur.

### Step 2.4 — Spotify OAuth + Export
- "Connect Spotify" via NextAuth as scoped above.
- "Export to Spotify" button: create playlist via `POST /me/playlists` for the current authenticated user, add resolved track URIs. This step is genuinely live/multi-call (creating playlist + adding items), so this is the appropriate place for a short staged-progress animation ("Creating your playlist...", "Adding tracks...", "Done!").
- On success, show a link to open the playlist in Spotify.

### Step 2.5 — Deployment
- Env vars needed in Vercel: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, database connection string.
- Env vars needed for the indexing script (run separately, not deployed): the above Spotify credentials, `GENIUS_ACCESS_TOKEN`, `ANTHROPIC_API_KEY`, database connection string.
- Update the Spotify Developer app's redirect URIs to include the production Vercel callback URL once deployed.

## Required credentials — pause and ask the user for these explicitly, do not fabricate placeholders
- Spotify Developer app Client ID + Secret (developer.spotify.com/dashboard)
- Genius API access token (genius.com/api-clients)
- Anthropic API key (console.anthropic.com)
- A Postgres connection string (Vercel Postgres, Supabase, or Neon — ask the user which they'd prefer, or default to Vercel Postgres for simplicity given the existing Vercel deployment target, but confirm before provisioning)

## Explicit instructions for Claude Code
- Build and test the indexing pipeline first, on a small sample (e.g. 5-10 playlists) before scaling to the full 150-300 — confirm the confidence-scoring math and escalation path work correctly on real data before committing to a long full run.
- Web search whenever uncertain: current Spotify market codes for regional coverage, current NextAuth Spotify provider setup, current Genius API behavior, current Vercel Postgres/Supabase setup steps.
- Never let the indexing pipeline logic leak into a Vercel API route — it must remain a standalone, long-running, resumable script.
- Never persist lyrics text under any circumstance, including in logs.
- If playlist sourcing falls meaningfully short of the 10k-20k track target, report this clearly rather than silently padding the catalog with lower-quality/generic playlists.
- At the end of both parts, summarize: indexing results (from Step 1.7), how to run the web app locally, and the deployed Vercel URL if deployment succeeded.
