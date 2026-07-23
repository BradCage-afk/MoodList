import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const { buildPrefs, queryIndex } = await import("../lib/query");

for (const [text, tags, inst] of [
  ["feeling heartbroken, hindi songs", [], false],
  ["", ["bollywood", "party"], false],
  ["something calm for studying", [], true],
] as [string, string[], boolean][]) {
  const prefs = buildPrefs(text, tags, inst);
  console.log(`\nQUERY text="${text}" tags=${JSON.stringify(tags)} inst=${inst}`);
  console.log("prefs:", JSON.stringify(prefs));
  const t0 = Date.now();
  const results = await queryIndex(prefs, 8);
  console.log(`${results.length} results in ${Date.now() - t0}ms`);
  for (const r of results.slice(0, 5)) {
    console.log(` - "${r.name}" by ${r.artists[0]} [${r.tags.language}/${r.tags.genre}/${r.tags.energy}/${r.tags.valence}] ${Math.round(r.confidence * 100)}%`);
  }
}
process.exit(0);
