// api/lib/aiProviders/openaiCompatible.js
//
// Shared transport for any OpenAI-compatible chat-completions API (Groq, OpenRouter,
// and OpenAI itself if added later): send a prompt, get parsed JSON back, or null on
// any failure. Providers differ only in endpoint, extra headers and default model.

export async function completeJSONOpenAICompatible({
  label,
  endpoint,
  extraHeaders = {},
  prompt,
  apiKey,
  model,
  timeoutMs = 8000
}) {
  if (!apiKey) {
    console.warn(`${label}: missing API key, skipping AI call.`);
    return null;
  }

  // A hung request must never stall the whole search route, so bound it explicitly.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders
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
    console.error(`${label}: network/timeout error`, err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`${label}: bad response`, res.status, errText);
    return null;
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    console.error(`${label}: empty response`, JSON.stringify(data).slice(0, 500));
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    console.error(`${label}: failed to parse JSON:`, text.slice(0, 500));
    return null;
  }
}
