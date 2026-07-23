// Tagging LLM client: NVIDIA NIM's OpenAI-compatible endpoint running
// meta/llama-3.1-8b-instruct (free tier; ~0.7s/call vs minutes for the
// reasoning-mode models). The endpoint supports response_format json_object
// but not json_schema, so schemas are spelled out in prompts and sanitizeTags
// is the authoritative validator.
import { requireEnv } from "./env";

const API_URL = process.env.LLM_API_URL ?? "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = process.env.LLM_MODEL ?? "z-ai/glm-5.2";
const apiKey = requireEnv("NVIDIA_API_KEY");

// Free-tier friendly pacing: one request at a time, small gap between them.
const MIN_GAP_MS = 1200;
let lastRequest = 0;
let queue: Promise<unknown> = Promise.resolve();

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    const wait = lastRequest + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();
    return fn();
  });
  queue = next.catch(() => {});
  return next as Promise<T>;
}

export async function llmJson(system: string, user: string, attempt = 0): Promise<unknown> {
  return throttled(async () => {
    try {
      return await llmOnce(system, user, attempt);
    } catch (err) {
      if (attempt < 3 && /timeout|abort|fetch failed|ECONNRESET/i.test(String(err))) {
        return llmOnce(system, user, attempt + 1);
      }
      throw err;
    }
  });
}

async function llmOnce(system: string, user: string, attempt: number): Promise<unknown> {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.1,
        max_tokens: 600,
        response_format: { type: "json_object" },
      }),
      // A hung request would otherwise drain the event loop and silently
      // kill the whole run with exit 0.
      signal: AbortSignal.timeout(90_000),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      const retryAfter = Math.min(Number(res.headers.get("retry-after") ?? 0) || 5 * (attempt + 1), 120);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return llmOnce(system, user, attempt + 1);
    }
    if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "";
    try {
      return JSON.parse(content);
    } catch {
      // Some models wrap JSON in fences despite json_object mode.
      const m = content.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
      throw new Error(`LLM returned non-JSON: ${content.slice(0, 120)}`);
    }
}
