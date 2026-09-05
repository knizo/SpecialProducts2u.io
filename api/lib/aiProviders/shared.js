// api/lib/aiProviders/shared.js
//
// Shared contract for every AI provider: the prompt we send, and the
// normalization applied to whatever JSON comes back. Keeping this in one
// place means every provider produces the exact same spec shape, so
// search-affiliate.js never has to care which one answered.

export function buildRefinePrompt(rawQuery) {
  return `You are a product-search assistant for an AliExpress affiliate shopping site.

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
- Write "queries" as concise AliExpress-style keyword phrases (roughly 2-6 words: product
  noun + key attributes), not full sentences and not the user's marketing-style wording
  verbatim — AliExpress's own search matches best against short keyword phrases, the same
  way a seller would title a listing.
- Keep "exclude" specific to this query's false positives, not a generic list.
- If the query is vague, make reasonable assumptions but keep "mustHave" short.

User query: "${rawQuery}"`;
}

// Defensive normalization so a slightly malformed AI response can never
// crash the search route — worst case it behaves like "no AI spec".
export function normalizeSpec(parsed, rawQuery) {
  const queries =
    Array.isArray(parsed?.queries) && parsed.queries.length
      ? parsed.queries.filter(Boolean).slice(0, 3)
      : [rawQuery];

  return {
    productType: typeof parsed?.productType === "string" ? parsed.productType : "generic",
    queries,
    mustHave: Array.isArray(parsed?.mustHave) ? parsed.mustHave.filter(Boolean) : [],
    niceToHave: Array.isArray(parsed?.niceToHave) ? parsed.niceToHave.filter(Boolean) : [],
    exclude: Array.isArray(parsed?.exclude) ? parsed.exclude.filter(Boolean) : [],
    price:
      parsed?.price && typeof parsed.price === "object"
        ? { min: parsed.price.min ?? null, max: parsed.price.max ?? null }
        : null,
    // undefined -> let AliExpress use its own relevance sort; scoreProduct already
    // ranks by volume itself, no need to force a sales-volume sort at the API level.
    sortPreference: undefined
  };
}
