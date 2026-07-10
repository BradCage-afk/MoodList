# Moodlist — live mood-curated Spotify playlists

Type how you feel and/or pick mood/activity/genre tags → get a live-curated
playlist of real, mainstream Spotify tracks → export it to your Spotify
account in one click.

**No pre-built track database.** Every request runs live:

1. **Search** — your tags + free text become ~8-10 parallel Spotify searches
   (`GET /search?type=track&limit=10`, since the limit is now capped at 10),
   pooled into ~70 unique candidates.
2. **Lyrics** — each candidate is looked up on Genius and its lyrics page is
   fetched server-side. Lyrics are used *internally only* for scoring and are
   never shown, returned, or stored (no copyrighted text reproduction).
3. **Score** — lyrics are scored against the bundled, offline
   [NRC Emotion Lexicon](https://saifmohammad.com/WebPages/NRC-Emotion-Lexicon.htm)
   (word-level v0.92, `/data/nrc-lexicon.json`) into a 10-dimension emotion
   vector, then ranked by cosine similarity to your target mood vector
   (built from your selected tags + free text in the same NRC space).
4. **Diversify** — max 2 tracks per artist, top ~24 returned.
5. **Stream** — pipeline stage progress is streamed to the UI over
   Server-Sent Events, so the loading animation reflects real progress.

Spotify's audio-features/analysis endpoints are unavailable to new apps, so
mood comes entirely from lyrics emotion — no audio analysis, no `preview_url`.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS 4 · Auth.js v5 (Spotify
OAuth, `playlist-modify-public playlist-modify-private`) · Framer Motion ·
deployed on Vercel.

## Setup

1. Create a Spotify app at <https://developer.spotify.com/dashboard> and add
   the redirect URI `http://127.0.0.1:3000/api/auth/callback/spotify`
   (Spotify no longer accepts `localhost` — use the loopback IP).
2. Create a Genius API client at <https://genius.com/api-clients> and copy
   its **Client Access Token**.
3. `cp .env.local.example .env.local` and fill in the values
   (`openssl rand -base64 32` for `NEXTAUTH_SECRET`).
4. ```bash
   npm install
   npm run dev
   ```
5. Open <http://127.0.0.1:3000> (not `localhost` — the OAuth callback must
   match), connect Spotify, describe a vibe, curate, export.

## Deploying to Vercel

- Add `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `NEXTAUTH_SECRET`,
  `GENIUS_ACCESS_TOKEN` in the Vercel project's environment variables
  (`NEXTAUTH_URL` is not needed on Vercel — the host is trusted).
- In the Spotify Developer dashboard, add the production redirect URI:
  `https://<your-app>.vercel.app/api/auth/callback/spotify`.

## Key files

| Path | What it is |
| --- | --- |
| `lib/nrc.ts` | NRC lexicon scoring: text → emotion vector, cosine similarity |
| `data/nrc-lexicon.json` | Bundled offline NRC word→emotions lexicon (6,468 words) |
| `data/tags.ts` | Tag taxonomy: search seeds + target NRC vectors per tag |
| `lib/curate.ts` | The live pipeline: search → lyrics → score → rank |
| `app/api/curate/route.ts` | SSE endpoint streaming pipeline progress |
| `app/api/export/route.ts` | Creates the playlist via `POST /me/playlists` |
| `auth.ts` | Auth.js v5 Spotify OAuth with token refresh |
