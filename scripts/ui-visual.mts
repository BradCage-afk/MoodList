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
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.context().addCookies([{ name: "authjs.session-token", value: session, url: "http://127.0.0.1:3000" }]);
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto("http://127.0.0.1:3000");
await page.waitForTimeout(800);
await page.screenshot({ path: "/home/ajeet/.claude/jobs/141f2811/tmp/v-empty.png" });

// select melancholy + lonely → indigo glow
await page.click("text=Melancholy");
await page.click("text=Lonely");
await page.waitForTimeout(1800);
await page.screenshot({ path: "/home/ajeet/.claude/jobs/141f2811/tmp/v-sadglow-top.png" });
// ring-artifact check at real page height: scroll to the bottom
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(600);
await page.screenshot({ path: "/home/ajeet/.claude/jobs/141f2811/tmp/v-sadglow-bottom.png" });

// switch to happy + hype → warm glow (tests hue transition + wraparound)
await page.evaluate(() => window.scrollTo(0, 0));
await page.click("text=Melancholy"); await page.click("text=Lonely");
await page.click("text=Happy"); await page.click("text=Hype");
await page.waitForTimeout(1800);
await page.screenshot({ path: "/home/ajeet/.claude/jobs/141f2811/tmp/v-warmglow.png" });

// results view
await page.fill("textarea", "bollywood party");
await page.click("text=Curate ✦");
await page.waitForSelector("text=Your mix", { timeout: 20000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: "/home/ajeet/.claude/jobs/141f2811/tmp/v-results.png" });

console.log("errors:", errors.length ? errors : "none");
await browser.close();
process.exit(0);
