// End-to-end UI test against the local prod server with a minted session
// cookie (real Spotify access token from the stored refresh token).
// Usage: npx tsx scripts/test-ui.mts [--export]
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { chromium } from "playwright";
import { encode } from "@auth/core/jwt";

const BASE = "http://127.0.0.1:3000";
const DO_EXPORT = process.argv.includes("--export");

// Fresh Spotify access token
const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization:
      "Basic " +
      Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64"),
  },
  body: new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: process.env.SPOTIFY_REFRESH_TOKEN!,
  }),
});
const tok = (await tokenRes.json()) as { access_token: string; expires_in: number };

const sessionToken = await encode({
  token: {
    name: "Test User",
    accessToken: tok.access_token,
    refreshToken: process.env.SPOTIFY_REFRESH_TOKEN,
    expiresAt: Math.floor(Date.now() / 1000) + tok.expires_in,
    spotifyId: process.env.ADMIN_SPOTIFY_ID,
    sub: process.env.ADMIN_SPOTIFY_ID,
  },
  secret: process.env.NEXTAUTH_SECRET!,
  salt: "authjs.session-token",
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([
  { name: "authjs.session-token", value: sessionToken, url: BASE },
]);
const page = await ctx.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(BASE);
console.log("title:", await page.title());
console.log("signed in:", await page.locator("text=Sign out").count());

// 1. Curate from text
await page.fill("textarea", "bollywood heartbreak, missing someone");
await page.click("text=Curate ✦");
await page.waitForSelector("text=Your mix", { timeout: 20000 });
const rows = await page.locator("ol > li").count();
console.log("curate results:", rows, "tracks");
await page.screenshot({ path: "/home/ajeet/.claude/jobs/141f2811/tmp/ui-results.png" });

// 2. Expand a row (why-this-song drawer)
await page.locator("ol > li button").first().click();
await page.waitForTimeout(500);
const drawer = await page.locator("text=Tag confidence").count();
console.log("drawer visible:", drawer > 0);

// 3. History: back to composer, open history
await page.click("text=Start over");
await page.click("text=♻ History");
await page.waitForTimeout(800);
const historyRows = await page.locator("li:has(button[aria-label='Delete this snapshot'])").count();
console.log("history entries:", historyRows);
await page.screenshot({ path: "/home/ajeet/.claude/jobs/141f2811/tmp/ui-history.png" });

// 4. Restore newest snapshot
if (historyRows > 0) {
  await page.locator("li:has(button[aria-label='Delete this snapshot']) > button").first().click();
  await page.waitForSelector("text=From your history", { timeout: 15000 });
  console.log("restore works: true");
}

// 5. Optional real export
if (DO_EXPORT) {
  await page.click("text=Export to Spotify");
  await page.waitForSelector("text=Open in Spotify", { timeout: 30000 });
  console.log("export works: true");
  await page.screenshot({ path: "/home/ajeet/.claude/jobs/141f2811/tmp/ui-exported.png" });
  // history entry should be gone now
  await page.click("text=Start over");
  await page.click("text=♻ History");
  await page.waitForTimeout(800);
  console.log("history after export:", await page.locator("li:has(button[aria-label='Delete this snapshot'])").count());
}

// 6. Admin page (as owner)
await page.goto(`${BASE}/admin`);
await page.waitForTimeout(1500);
console.log("admin users table:", await page.locator("text=Users (").count() > 0);
await page.screenshot({ path: "/home/ajeet/.claude/jobs/141f2811/tmp/ui-admin.png" });

console.log("page errors:", errors.length ? errors : "none");
await browser.close();
process.exit(0);
