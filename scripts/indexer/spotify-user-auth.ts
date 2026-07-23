// One-time interactive Spotify user authorization for the indexing pipeline.
//
// Since 2026, GET /playlists/{id}/items requires a user token (client
// credentials returns 401/403), so the indexer needs a real user grant once.
// This script listens on the app's already-registered loopback redirect URI,
// prints an authorize URL to open in a browser, exchanges the returned code,
// and appends SPOTIFY_REFRESH_TOKEN to .env.local. The indexer then mints
// fresh access tokens from that refresh token unattended.
//
// Run: npx tsx scripts/indexer/spotify-user-auth.ts
import { ENV_PATH, requireEnv } from "./env";
import { createServer } from "node:http";
import { appendFileSync, readFileSync } from "node:fs";

const REDIRECT_URI = "http://127.0.0.1:3000/api/auth/callback/spotify";
const SCOPES = "playlist-modify-public playlist-modify-private";

const clientId = requireEnv("SPOTIFY_CLIENT_ID");
const clientSecret = requireEnv("SPOTIFY_CLIENT_SECRET");

if (readFileSync(ENV_PATH, "utf8").includes("SPOTIFY_REFRESH_TOKEN=")) {
  console.log("SPOTIFY_REFRESH_TOKEN already present in .env.local — nothing to do.");
  process.exit(0);
}

const state = Math.random().toString(36).slice(2);
const authUrl =
  "https://accounts.spotify.com/authorize?" +
  new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state,
  });

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1:3000");
  if (!url.pathname.startsWith("/api/auth/callback/spotify")) {
    res.writeHead(404).end();
    return;
  }
  const code = url.searchParams.get("code");
  if (!code || url.searchParams.get("state") !== state) {
    res.writeHead(400, { "Content-Type": "text/plain" }).end("Bad callback — restart the script and try again.");
    return;
  }
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI }),
  });
  const tokens = (await tokenRes.json()) as { refresh_token?: string; error_description?: string };
  if (!tokens.refresh_token) {
    res.writeHead(500, { "Content-Type": "text/plain" }).end("Token exchange failed: " + (tokens.error_description ?? "unknown"));
    console.error("Token exchange failed:", tokens);
    process.exit(1);
  }
  appendFileSync(ENV_PATH, `SPOTIFY_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  res
    .writeHead(200, { "Content-Type": "text/html" })
    .end("<h2>Moodlist indexer authorized ✓</h2>You can close this tab.");
  console.log("Refresh token saved to .env.local.");
  server.close();
  process.exit(0);
});

server.listen(3000, "127.0.0.1", () => {
  console.log("\nOpen this URL in your browser and approve access:\n");
  console.log(authUrl + "\n");
});
