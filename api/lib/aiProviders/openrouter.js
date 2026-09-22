// api/lib/aiProviders/openrouter.js
//
// OpenRouter implementation of the "refineQuery" contract. OpenRouter's API is
// OpenAI-compatible (chat completions) — same shape as groq.js, just a different
// endpoint/auth, plus the two attribution headers OpenRouter asks integrations to send.

import { buildRefinePrompt, normalizeSpec } from "./shared.js";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export async function refineQuery(rawQuery, { apiKey, model = "qwen/qwen3.8-27b:free" } = {}) {
  if (!apiKey) {
    console.warn("OpenRouter refineQuery: missing API key, skipping AI refinement.");
    return null;
  }

  const prompt = buildRefinePrompt(rawQuery);

  // Same reasoning as groq.js/gemini.js: a hung/slow call must never stall the search route.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let res;
  try {
    res = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        // Optional but recommended by OpenRouter for attribution/rankings on their end —
        // has no effect on the request itself.
        "HTTP-Referer": "https://store.knizo.com",
        "X-Title": "Special-Products"
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        response_format: { type: "json_object" }
      }),
      signal: controller.signal
    });
  } catch (err) {
    console.error("OpenRouter refineQuery: network/timeout error", err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("OpenRouter refineQuery: bad response", res.status, errText);
    return null;
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    console.error("OpenRouter refineQuery: empty response", JSON.stringify(data).slice(0, 500));
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    return normalizeSpec(parsed, rawQuery);
  } catch (e) {
    console.error("OpenRouter refineQuery: failed to parse JSON:", text.slice(0, 500));
    return null;
  }
}
