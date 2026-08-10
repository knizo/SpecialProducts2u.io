// api/lib/aiProviders/gemini.js
//
// Gemini implementation of the "refineQuery" contract.
// Turns a raw user search string into a structured spec the
// AliExpress search logic can use directly (replacing the old
// simplifyQuery/buildFallbackSpec word-truncation approach).

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export async function refineQuery(rawQuery, { apiKey, model = "gemini-2.5-flash" } = {}) {
  if (!apiKey) {
    console.warn("Gemini refineQuery: missing API key, skipping AI refinement.");
    return null;
  }

  const prompt = `You are a product-search assistant for an AliExpress affiliate shopping site.

Given a user's shopping search query, extract a structured JSON spec that will be used
to search the AliExpress product catalog and to filter out irrelevant results (like
accessories, cases, or replacement parts when the user wants the actual product).

Return ONLY valid JSON (no markdown fences, no explanation) in exactly this shape:
{
  "productType": "short noun phrase for the core product, e.g. 'wallet', 'wireless earbuds'",
  "queries": ["1 to 3 good AliExpress search strings, most specific first"],
  "mustHave": ["words/features the product title should reasonably include"],
  "niceToHave": ["words/features that are a bonus but not required"],
  "exclude": ["words that would indicate the WRONG product for this query, e.g. accessories, cases, replacement parts, unrelated items"],
  "price": { "min": number or null, "max": number or null }
}

Rules:
- Never drop the core product noun from "queries" (this was a bug before — don't repeat it).
- Keep "exclude" specific to this query's false positives, not a generic list.
- If the query is vague, make reasonable assumptions but keep "mustHave" short.

User query: "${rawQuery}"`;

  const url = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${apiKey}`;

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
      })
    });
  } catch (err) {
    console.error("Gemini refineQuery: network error", err.message);
    return null;
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

// Defensive normalization so a slightly malformed AI response can never
// crash the search route — worst case it behaves like "no AI spec".
function normalizeSpec(parsed, rawQuery) {
  const queries =
    Array.isArray(parsed.queries) && parsed.queries.length
      ? parsed.queries.filter(Boolean).slice(0, 3)
      : [rawQuery];

  return {
    productType: typeof parsed.productType === "string" ? parsed.productType : "generic",
    queries,
    mustHave: Array.isArray(parsed.mustHave) ? parsed.mustHave.filter(Boolean) : [],
    niceToHave: Array.isArray(parsed.niceToHave) ? parsed.niceToHave.filter(Boolean) : [],
    exclude: Array.isArray(parsed.exclude) ? parsed.exclude.filter(Boolean) : [],
    price:
      parsed.price && typeof parsed.price === "object"
        ? { min: parsed.price.min ?? null, max: parsed.price.max ?? null }
        : null,
    sortPreference: "LAST_VOLUME_DESC"
  };
}
