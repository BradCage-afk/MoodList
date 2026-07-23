import type { NextAuthConfig } from "next-auth";
import Spotify from "next-auth/providers/spotify";
import type { JWT } from "next-auth/jwt";

const SPOTIFY_SCOPES = "playlist-modify-public playlist-modify-private";

function logActivity(userId: string, displayName: string | null, action: string) {
  import("@/lib/activity")
    .then(({ logActivity }) => logActivity(userId, displayName, action))
    .catch(() => {});
}

async function refreshSpotifyToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(
            `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
          ).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refreshToken as string,
      }),
    });
    const refreshed = await res.json();
    if (!res.ok) throw refreshed;
    return {
      ...token,
      accessToken: refreshed.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + refreshed.expires_in,
      // Spotify may or may not rotate the refresh token
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshTokenError" };
  }
}

/**
 * Shared Auth.js config. Consumed by both NextAuth() (for auth()/signIn()/
 * signOut()) and the route handler, which calls @auth/core's Auth() directly
 * with a plain Request — see app/api/auth/[...nextauth]/route.ts for why.
 */
export const authConfig: NextAuthConfig = {
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  basePath: "/api/auth",
  providers: [
    Spotify({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      authorization: {
        url: "https://accounts.spotify.com/authorize",
        params: { scope: SPOTIFY_SCOPES },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // Initial sign-in: persist Spotify tokens on the JWT
      if (account) {
        const spotifyId = (profile?.id as string | undefined) ?? token.sub;
        // Activity log (admin page reads this). Fire-and-forget: login must
        // never fail because the DB hiccuped.
        logActivity(spotifyId ?? "unknown", (profile?.display_name as string | undefined) ?? null, "login");
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
          spotifyId,
        };
      }
      // Still valid (60s safety margin)
      if (Date.now() / 1000 < (token.expiresAt as number) - 60) return token;
      return refreshSpotifyToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.error = token.error as string | undefined;
      session.spotifyId = token.spotifyId as string | undefined;
      return session;
    },
  },
};
