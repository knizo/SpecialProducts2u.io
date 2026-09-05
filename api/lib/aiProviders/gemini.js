// api/lib/aiProviders/gemini.js
//
// Gemini implementation of the "refineQuery" contract.
// Turns a raw user search string into a structured spec the
// AliExpress search logic can use directly (replacing the old
// simplifyQuery/buildFallbackSpec word-truncation approach).

import { buildRefinePrompt, normalizeSpec } from "./shared.js";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export async function refineQuery(rawQuery, { apiKey, model = "gemini-3.6-flash" } = {}) {
  if (!apiKey) {
    console.warn("Gemini refineQuery: missing API key, skipping AI refinement.");
    return null;
  }

  const prompt = buildRefinePrompt(rawQuery);
  const url = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${apiKey}`;

  // AI refinement now runs by default on every search — a hung request must never
  // stall the whole route, so bound it explicitly.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json"
        }
      }),
      signal: controller.signal
    });
  } catch (err) {
    console.error("Gemini refineQuery: network/timeout error", err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("Gemini refineQuery: bad response", res.status, errText);
    return null;
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    console.error("Gemini refineQuery: empty response", JSON.stringify(data).slice(0, 500));
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    return normalizeSpec(parsed, rawQuery);
  } catch (e) {
    console.error("Gemini refineQuery: failed to parse JSON:", text.slice(0, 500));
    return null;
  }
}
