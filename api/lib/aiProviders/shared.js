// api/lib/aiProviders/shared.js
//
// Shared contract for every AI provider: the prompts we send, and the normalization
// applied to whatever JSON comes back. Providers only move bytes (completeJSON); keeping
// the prompts here means every provider produces the exact same shapes, so the search
// code never has to care which one answered.

export function buildRefinePrompt(rawQuery) {
  return `You are a product-search assistant for an AliExpress affiliate shopping site.

Given a user's shopping search query, extract a structured JSON spec that will be used
to search the AliExpress product catalog and to filter out irrelevant results (like
accessories, cases, or replacement parts when the user wants the actual product).

Return ONLY valid JSON (no markdown fences, no explanation) in exactly this shape:
{
  "matchQuery": "the product the user wants, as plain English keywords (5-12 words)",
  "productType": "short noun phrase for the core product, e.g. 'wallet', 'wireless earbuds'",
  "queries": ["1 to 3 good AliExpress search strings, most specific first"],
  "mustHave": ["words/features the product title should reasonably include"],
  "niceToHave": ["words/features that are a bonus but not required"],
  "exclude": ["words that would indicate the WRONG product for this query, e.g. accessories, cases, replacement parts, unrelated items"],
  "price": { "min": number or null, "max": number or null }
}

Rules:
- The query may be in any language (often Hebrew). AliExpress product titles are in
  English, so EVERY field above must be written in English — translate the user's
  meaning, don't transliterate it. "matchQuery" is the full English meaning of the query
  and is used to compare against product titles.
- Never drop the core product noun from "queries" (this was a bug before — don't repeat it).
- Write "queries" as concise AliExpress-style keyword phrases (roughly 2-6 words: product
  noun + key attributes), not full sentences and not the user's marketing-style wording
  verbatim — AliExpress's own search matches best against short keyword phrases, the same
  way a seller would title a listing.
- If the query names a specific brand, model, or part/model code (e.g. "GS3", "iPhone 15
  Pro", "RTX 4090", "GAC Trumpchi"), that is the single strongest signal of a correct match —
  never paraphrase or drop it. Keep it verbatim in every "queries" entry, and always add it to
  "mustHave" so an unrelated but popular listing can't outrank the actual matching product.
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
    matchQuery:
      typeof parsed?.matchQuery === "string" && parsed.matchQuery.trim()
        ? parsed.matchQuery.trim()
        : null,
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

// Titles are seller-written and can be very long; cap them so the prompt stays small.
const MAX_TITLE_LEN = 200;

export function buildVerifyPrompt(rawQuery, titles) {
  const list = titles
    .map((t, i) => `${i}. ${String(t || "").slice(0, MAX_TITLE_LEN)}`)
    .join("\n");

  return `You are checking AliExpress search results for a shopping site.

The shopper searched for: "${rawQuery}"
(The search may be in any language, e.g. Hebrew — understand what they mean.)

Rate how well each product below matches what the shopper actually wants, from 0 to 10:
- 10 = exactly the product asked for (right product type, and the right brand/model/part
  number if the search named one)
- 7-9 = the right kind of product, with minor differences
- 4-6 = related but not what was asked (different model, close variant)
- 1-3 = an accessory/part FOR the product, or a different product that merely shares keywords
- 0 = unrelated

Return ONLY valid JSON (no markdown fences, no explanation) in exactly this shape,
with one entry per product:
{"scores": [{"i": 0, "score": 8}, {"i": 1, "score": 2}]}

Products:
${list}`;
}

// Returns an array of length `count` holding each product's 0-10 score (null where the
// AI skipped one), or null if the answer is unusable — callers treat null as "the check
// didn't run" and keep their own ranking.
export function normalizeVerify(parsed, count) {
  if (!Array.isArray(parsed?.scores)) return null;

  const scores = new Array(count).fill(null);
  for (const entry of parsed.scores) {
    const i = Number(entry?.i);
    const score = Number(entry?.score);
    if (Number.isInteger(i) && i >= 0 && i < count && Number.isFinite(score)) {
      scores[i] = Math.max(0, Math.min(10, score));
    }
  }

  return scores.some((s) => s !== null) ? scores : null;
}
