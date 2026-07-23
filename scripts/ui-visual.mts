// Visual check: warm palette, live preview strip, pairs-well-with hints.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { chromium } from "playwright";
import { encode } from "@auth/core/jwt";

const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded",
    Authorization: "Basic " + Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64") },
  body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: process.env.SPOTIFY_REFRESH_TOKEN! }),
});
const tok = await tokenRes.json() as { access_token: string; expires_in: number };
const session = await encode({
  token: { name: "Test", accessToken: tok.access_token, expiresAt: Math.floor(Date.now()/1000) + tok.expires_in, spotifyId: process.env.ADMIN_SPOTIFY_ID, sub: process.env.ADMIN_SPOTIFY_ID },
  secret: process.env.NEXTAUTH_SECRET!, salt: "authjs.session-token",
});
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 950 } })).newPage();
await page.context().addCookies([{ name: "authjs.session-token", value: session, url: "http://127.0.0.1:3000" }]);
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto("http://127.0.0.1:3000");
await page.waitForTimeout(1500);
await page.screenshot({ path: "/home/ajeet/.claude/jobs/141f2811/tmp/w-idle.png" });

await page.click("text=Melancholy");
await page.click("text=Punjabi");
await page.waitForTimeout(1500);
await page.screenshot({ path: "/home/ajeet/.claude/jobs/141f2811/tmp/w-selected.png" });
const strip = await page.locator("text=match this exact mood").textContent().catch(() => null);
console.log("preview strip:", strip ?? "NOT FOUND");
console.log("pairs hint:", await page.locator("text=pairs well with").count());

await page.fill("textarea", "sad punjabi songs for late night");
await page.click("text=Curate ✦");
await page.waitForSelector("text=Your mix", { timeout: 20000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: "/home/ajeet/.claude/jobs/141f2811/tmp/w-results.png" });
console.log("errors:", errors.length ? errors : "none");
await browser.close();
process.exit(0);
