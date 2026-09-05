// api/lib/aiProviders/groq.js
//
// Groq implementation of the "refineQuery" contract. Groq's API is
// OpenAI-compatible (chat completions), so this is a plain fetch — no SDK
// dependency needed, same approach as gemini.js.

import { buildRefinePrompt, normalizeSpec } from "./shared.js";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export async function refineQuery(rawQuery, { apiKey, model = "openai/gpt-oss-20b" } = {}) {
  if (!apiKey) {
    console.warn("Groq refineQuery: missing API key, skipping AI refinement.");
    return null;
  }

  const prompt = buildRefinePrompt(rawQuery);

  // Same reasoning as gemini.js: a hung/slow call must never stall the search route.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let res;
  try {
    res = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
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
    console.error("Groq refineQuery: network/timeout error", err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("Groq refineQuery: bad response", res.status, errText);
    return null;
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    console.error("Groq refineQuery: empty response", JSON.stringify(data).slice(0, 500));
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    return normalizeSpec(parsed, rawQuery);
  } catch (e) {
    console.error("Groq refineQuery: failed to parse JSON:", text.slice(0, 500));
    return null;
  }
}
