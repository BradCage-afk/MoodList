import { Auth, type AuthConfig } from "@auth/core";
import { authConfig } from "@/auth-config";

export const dynamic = "force-dynamic";

/**
 * We call @auth/core's Auth() directly with a plain Request instead of using
 * next-auth's handlers. Reason: Next's NextRequest/NextURL normalizes loopback
 * IP hosts to "localhost" (http://127.0.0.1:3000 → http://localhost:3000), so
 * in local dev the OAuth redirect_uri became localhost — which Spotify no
 * longer accepts as a registered redirect URI. A plain Request preserves the
 * origin from AUTH_URL exactly; in production (no AUTH_URL set) the incoming
 * request URL is used as-is.
 */
function withEnvOrigin(req: Request): Request {
  const envUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (!envUrl) return req;
  const url = new URL(req.url);
  const env = new URL(envUrl);
  url.protocol = env.protocol;
  url.host = env.host;
  return new Request(url, req);
}

const handler = (req: Request) => Auth(withEnvOrigin(req), authConfig as AuthConfig);

export { handler as GET, handler as POST };
