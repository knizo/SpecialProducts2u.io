// api/lib/aiProviders/gemini.js
//
// Gemini transport: send a prompt, get parsed JSON back (or null on any failure).
// What the prompts say and how answers are normalized lives in shared.js, so every
// provider behaves identically for every task.

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export async function completeJSON(prompt, { apiKey, model = "gemini-3.6-flash", timeoutMs = 8000 } = {}) {
  if (!apiKey) {
    console.warn("Gemini: missing API key, skipping AI call.");
    return null;
  }

  const url = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${apiKey}`;

  // A hung request must never stall the whole search route, so bound it explicitly.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
    console.error("Gemini: network/timeout error", err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("Gemini: bad response", res.status, errText);
    return null;
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    console.error("Gemini: empty response", JSON.stringify(data).slice(0, 500));
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    console.error("Gemini: failed to parse JSON:", text.slice(0, 500));
    return null;
  }
}
