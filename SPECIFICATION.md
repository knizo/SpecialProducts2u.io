# Specification

Behavioral spec for Special-Products. For the system diagram and request flow, see
[ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Product data model

Defined in [types.ts](types.ts):

```ts
interface Product {
  id: string;
  title: string;
  price: number;
  currency: string;
  imageUrl: string;
  affiliateLink: string;
  description: string;
  category: string;
  createdAt: number;
}
```

- **Curated products** (added via the admin panel) are stored either in Firestore
  (`products` collection, shared across all visitors) or in browser `localStorage`
  (`alifinds_products_v1`, per-browser) — whichever `services/firebase.ts` determines is
  configured.
- **Affiliate search results** are constructed on the fly from the AliExpress API response and
  are never persisted; they only live in React state (`affiliateResults` in `App.tsx`) for the
  duration of the search.

## 2. Home page behavior

- On load, the page shows the curated product catalog (`subscribeToProducts`), or an empty/error
  state if none exist / the DB errors.
- Typing in the search box and submitting (Enter or the "AliExpress" button) triggers a **live
  AliExpress affiliate search** (`handleAffiliateSearch` in `App.tsx`), replacing the displayed
  grid with up to 6 ranked AliExpress results.
- Clearing the search box reverts to the curated catalog view, client-side-filtered by
  substring match on `title`/`description` against the remaining search term (this local filter
  runs independently of the AliExpress search, whenever `isAffiliateSearch` is `false`).
- Each product card's "Buy Now" button opens `affiliateLink` in a new tab. For AliExpress
  results, this is the AliExpress `promotion_link` — already embedded with the configured
  `ALIEXPRESS_TRACKING_ID`, so clicks attribute commission correctly regardless of how the
  visitor reached the product.

## 3. `/api/search-affiliate` contract

**Request:** `GET /api/search-affiliate?q=<query>&debug=0|1&ship_to_country=US&page_size=30&min_sale_price=&max_sale_price=&delivery_days=`

**Response (200):**
```json
{
  "title": "...", "price": 0, "currency": "USD", "image": "...", "affiliate_link": "...",
  "results": [ { "score": 0, "title": "...", "price": 0, "currency": "USD", "image": "...", "affiliate_link": "..." } ],
  "meta": { "...": "only present when debug=1" }
}
```
- `title`/`price`/`currency`/`image`/`affiliate_link` (top level) are a **legacy single-product
  shape** kept for backward compatibility — the selected product is chosen with a
  weighted-random bias toward (but not always equal to) the #1-ranked result (`pickWithBias`,
  see §5), not always literally the top score.
- `results` is the array the frontend actually renders: the top 6 ranked products.
- `debug=1` additionally returns `meta` (input query, whether AI refinement was used, the
  AliExpress queries actually issued, ship-to country, page size) and, on a "no product found"
  error, the raw AliExpress response and request URL — for troubleshooting signature/credential
  issues.

**Errors:**
- `500` — missing `ALIEXPRESS_APP_KEY` / `ALIEXPRESS_APP_SECRET` / `ALIEXPRESS_TRACKING_ID`.
- `404` — no products found (after querying + filtering + reranking).
- `500` — unhandled exception (message included in response).

## 4. Query refinement spec (AI or heuristic)

Both the AI path (Gemini) and the no-AI fallback path produce the same **spec** shape, which
`search-affiliate.js` consumes identically regardless of source:

```ts
{
  productType: string;           // short noun phrase, e.g. "wireless earbuds"
  queries: string[];              // 1-3 AliExpress-style keyword phrases, most specific first
  mustHave: string[];             // words the title should reasonably include (scoring bonus)
  niceToHave: string[];           // bonus words (smaller scoring bonus)
  exclude: string[];              // words indicating the wrong product (accessories, etc.)
  price: { min: number|null, max: number|null } | null;
  sortPreference: undefined;      // reserved; currently always undefined (see §6)
  rawQuery?: string;              // injected by search-affiliate.js after spec selection, for scoring
}
```

### 4a. AI path — provider switchboard

The prompt (`buildRefinePrompt`) and the response normalization (`normalizeSpec`) live in
[api/lib/aiProviders/shared.js](api/lib/aiProviders/shared.js) and are shared by every provider,
so they all produce byte-for-byte the same spec shape regardless of which model answered.
`search-affiliate.js` never talks to a provider directly — it calls `getAIProvider()`
([api/lib/aiProviders/index.js](api/lib/aiProviders/index.js)), which reads `AI_PROVIDER`
(default `groq`) and dispatches to the matching module.

Every provider call:
- Runs by default on every search unless `AI_REFINE_ENABLED=0`, or the active provider's API key
  is missing, or `AI_PROVIDER` names an unregistered provider.
- Is bounded to an 8-second timeout (`AbortController`); any network error, non-2xx response,
  empty response, or JSON parse failure returns `null` — the caller then falls back to the
  heuristic spec (§4b). A hung or failing AI call must never fail the whole search.

**Groq** ([api/lib/aiProviders/groq.js](api/lib/aiProviders/groq.js)) — default provider, free
tier. OpenAI-compatible chat-completions endpoint (`api.groq.com/openai/v1/chat/completions`),
model `openai/gpt-oss-20b` (overridable via `GROQ_MODEL`), `response_format:
{ type: "json_object" }`, `temperature: 0.2`. Key: `GROQ_API_KEY`. Groq's enabled-model lineup
varies by key/org and changes over time (the older `llama-3.x` model names have been retired) —
a `model_not_found` response means the configured `GROQ_MODEL` isn't enabled for that key (see
README for how to list what is).

**Gemini** ([api/lib/aiProviders/gemini.js](api/lib/aiProviders/gemini.js)) — alternative
provider, select with `AI_PROVIDER=gemini`. Model `gemini-3.6-flash` (overridable via
`GEMINI_MODEL`), `responseMimeType: "application/json"`, `temperature: 0.2`. Key:
`GEMINI_API_KEY`.

Switching providers, or adding a new one (OpenAI/ChatGPT, etc.), never touches
`search-affiliate.js` or the ranking logic — see §4c.

### 4b. Heuristic fallback — `buildFallbackSpec()`

- Used whenever the AI path returns `null`.
- Detects an "AirPods-like" query (`airpods`/`air pods`/`airpod` substring) and special-cases it:
  `productType: "wireless_earbuds"`, a `$20-$250` price band, `mustHave: ["earbuds", "tws"]`,
  and 3 broadened queries (e.g. `"<q> anc"`, `"<q> tws anc"`, a fixed
  `"tws earbuds anc airpods pro 2"`).
- For every other query: a single query equal to the raw input, no price band, and a fixed
  default `exclude` list of common accessory terms (`case`, `cover`, `strap`, `replacement`,
  `charging case`, `skin`, `protector`, etc.) to filter out accessories when the user wants the
  actual product.

### 4c. Adding a new AI provider

Per the comment in [api/lib/aiProviders/index.js](api/lib/aiProviders/index.js): create
`api/lib/aiProviders/<name>.js` exporting `refineQuery(rawQuery, opts) => Promise<spec|null>`,
built on `buildRefinePrompt`/`normalizeSpec` from `shared.js` (see `groq.js` or `gemini.js` for
the pattern), register it in the `PROVIDERS` map, and set `AI_PROVIDER=<name>`. No other code
changes are required.

## 5. Ranking algorithm — `scoreProduct()`

Every candidate product (after dedup + exclude-filtering) is scored and sorted descending. Score
is a sum of:

| Signal | Weight | Notes |
|---|---|---|
| Query-word match in title | `(matched / total) * 30` | Filler words (`for`, `with`, `and`, ...) excluded from `spec.rawQuery` before matching. Highest-weighted signal — prevents an unrelated high-rated product from beating an accurate match. |
| Rating (`evaluate_rate`) | `rating * 2` | |
| Sales volume (`lastest_volume`) | `log10(volume + 1) * 12` | Log-scaled so viral bestsellers don't totally dominate. |
| Commission rate | `commission * 2` | Rewards more profitable listings. |
| Price out of `spec.price` band | `-10` each side | Only applied if `spec.price.min`/`max` set. |
| Suspiciously cheap (`price < 3`) | `-25` | Filters likely-mislabeled/junk listings. |
| Global negative terms (`refurbished`, `used`, `copy`, `replica`, `fake`) | `-30` each | Universal, not query-specific. |
| `spec.mustHave` term present | `+10` each | |
| `spec.niceToHave` term present | `+4` each | |
| `spec.productType` phrase present | `+4` | |
| Random jitter | `+0..2` | Small enough to not reorder distant results; adds variety among near-ties. |

After ranking, `pickWithBias(ranked, k=3)` selects the legacy single "best" product via a
weight-decreasing random draw over the top 3 (weights `3, 2, 1`) — biased toward, but not
guaranteed to be, the #1 result. The `results` array returned to the client is simply the top 6
by score, unaffected by this bias.

## 6. Result-set widening

If the primary query (+ up to 2 AI-suggested alternates) returns fewer than 5 total products,
the route re-queries once more using a shortened keyword string (`simplifyQuery`: strips filler
words and brand/platform stopwords like `iphone`/`android`, keeps the first 3 tokens) to widen
the net before giving up.

## 7. Admin panel behavior

- **Add product** ([components/AdminPanel.tsx](components/AdminPanel.tsx)): manual form
  (title, price, image URL, affiliate link, description, category). "Auto-Fill with AI" calls
  `suggestCategory()` then `generateProductDescription()`
  ([services/geminiService.ts](services/geminiService.ts), client-side Gemini call using the
  `API_KEY` env var) to fill category + a persuasive <60-word description from just the title.
  Missing image URL falls back to a random `picsum.photos` placeholder; missing affiliate link
  falls back to `#`.
- **Login** ([components/Login.tsx](components/Login.tsx)): username/password against
  `localStorage`-stored `AdminConfig` (default `admin`/`admin`), then a TOTP step if 2FA is
  enabled.
- **Settings** ([components/AdminSettings.tsx](components/AdminSettings.tsx)): change
  username/password, and enroll/disable 2FA (20-byte TOTP secret, SHA1/6-digit/30s, QR code via
  `qrcode`, verified with a ±1 time-step window).

> See [TASKS.md](TASKS.md) for known gaps between this spec and the current `App.tsx` wiring
> (the admin/login/settings views are not currently reachable from the rendered UI).
