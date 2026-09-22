# Architecture

System design for Special-Products: a React SPA + Vercel serverless API that turns a search
query into ranked AliExpress affiliate product cards, with an optional Firestore-backed admin
catalog on the side.

## Components

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Browser (React SPA — App.tsx)                                            │
│                                                                            │
│  Search box ──▶ affiliateSearch() [services/affiliateSearch.ts]          │
│                     │  GET /api/search-affiliate?q=...                    │
│                     ▼                                                     │
│  ProductCard grid ◀── mapped AffiliateItem[] (max 6)                     │
│                                                                            │
│  subscribeToProducts() [services/storageService.ts] ──▶ curated products  │
│                     │  Firestore onSnapshot("products")                   │
│                     │  or localStorage fallback if Firebase unconfigured  │
│                     ▼                                                     │
│  ProductCard grid (local/curated catalog, shown when search is empty)    │
└──────────────────────────────────────────────────────────────────────────┘
                     │                              │
                     │ HTTPS                        │ Firestore SDK
                     ▼                              ▼
┌────────────────────────────────────┐   ┌───────────────────────────┐
│ Vercel Serverless Functions (/api) │   │ Firebase Firestore          │
│                                     │   │  collection "products"      │
│ search-affiliate.js  ─┐             │   │  (falls back to per-browser │
│   (website HTTP route)│             │   │   localStorage if VITE_     │
│                       ├─▶ lib/affiliateSearch.js   FIREBASE_* unset) │
│ telegram-webhook.js  ─┘   (shared search core)                        │
│   (group bot)          ├─ getAIProvider() ──┐                        │
│                        │  (lib/aiProviders) ▼                        │
│                        │   Groq (default) or Gemini (query refinement)
│                        │                                              │
│                        └─ aliSearch() (MD5-signed) ──▶ AliExpress Open Platform API
│                                                    (aliexpress.affiliate.product.query)
│ aliexpress-generate-link.js                                           │
│ aliexpress-test.js                                                    │
└──────────────────────────────────────────────────────────────────────┘
                        ▲
                        │ POST /api/telegram-webhook (secret_token verified)
                        │
              ┌─────────────────────┐
              │ Telegram Bot API     │◀── group members typing
              │  (webhook updates)   │    "/deal <query>" or "<trigger> <query>"
              └─────────────────────┘
```

## Request flow: affiliate search

1. User types a query and submits the search form in [App.tsx](App.tsx).
2. [services/affiliateSearch.ts](services/affiliateSearch.ts) calls
   `GET /api/search-affiliate?q=<query>`.
3. [api/search-affiliate.js](api/search-affiliate.js) maps the query params and delegates to
   `searchAffiliate()` in [api/lib/affiliateSearch.js](api/lib/affiliateSearch.js), which:
   1. Reads `ALIEXPRESS_APP_KEY` / `ALIEXPRESS_APP_SECRET` / `ALIEXPRESS_TRACKING_ID` from env;
      returns `missing_env` (the route maps that to a 500) if any are missing.
   2. Calls `refineWithAI(rawQuery)`, which delegates to
      [api/lib/aiProviders/index.js](api/lib/aiProviders/index.js) → whichever provider
      `AI_PROVIDER` selects (default [groq.js](api/lib/aiProviders/groq.js), or
      [gemini.js](api/lib/aiProviders/gemini.js) / [openrouter.js](api/lib/aiProviders/openrouter.js)),
      unless `AI_REFINE_ENABLED=0` or that provider's API key is missing. The provider returns a
      structured **spec** (see [SPECIFICATION.md](SPECIFICATION.md)) or `null` on any
      failure/timeout (8s bound).
   3. Falls back to `buildFallbackSpec()` (heuristic, no AI) if the AI spec is `null`.
   4. Runs up to 3 AliExpress queries from `spec.queries`, MD5-signing each request
      (`aliexpress.affiliate.product.query`).
   5. If fewer than 5 results come back, re-queries once with a shortened/broadened keyword
      string (`simplifyQuery`).
   6. Deduplicates by `product_id` (or title+image), filters out `spec.exclude` terms, then
      scores and ranks every remaining product (`scoreProduct`) — see the ranking spec.
   7. Picks a weighted-random "best" product from the top 3 (`pickWithBias`) for the legacy
      single-product fields, and returns the top 6 as `results`.
4. The client maps the top 6 into `Product[]` and renders them via
   [components/ProductCard.tsx](components/ProductCard.tsx). Each card's "Buy Now" button links
   directly to the AliExpress `promotion_link`, which already carries the tracking ID.

## Request flow: Telegram group bot

1. Someone in the group posts `/deal <query>` (or `<TELEGRAM_TRIGGER> <query>`); Telegram POSTs
   the update to [api/telegram-webhook.js](api/telegram-webhook.js).
2. The webhook verifies the `X-Telegram-Bot-Api-Secret-Token` header against
   `TELEGRAM_WEBHOOK_SECRET` (the URL is public, so this is what keeps strangers from making the
   bot post into the group), then `extractQuery()` decides whether the message is actually asking
   for a product. Anything unrecognized is ignored silently — the bot stays quiet in normal chat.
3. Calls the same `searchAffiliate()` core the website uses, with `shipTo` from
   `TELEGRAM_SHIP_TO` (there's no visitor IP to geolocate — the request comes from Telegram's
   servers, not the person typing).
4. Replies via Telegram's `sendMessage` with the title, price, and the tracked affiliate link.
   It sends `results[0]` — the strictly top-ranked product — rather than the website's
   randomized `best`, since in the group the point is to answer with the exact item asked for.
5. Always returns HTTP 200, even on internal errors: a non-2xx or a timeout makes Telegram retry
   the same update, which would post duplicate replies into the group.

> Note: serverless functions can't long-poll, so this is webhook-based. Registration is a
> one-time `setWebhook` call — see [README.md](README.md#telegram-bot-setup).

## Request flow: curated catalog (admin-added products)

1. On mount, `App.tsx` calls `subscribeToProducts()`
   ([services/storageService.ts](services/storageService.ts)).
2. If Firebase env vars are set ([services/firebase.ts](services/firebase.ts) initializes the
   app), it opens a live Firestore `onSnapshot` listener on the `products` collection, ordered by
   `createdAt` desc — updates are shared across all visitors in real time.
3. If Firebase is not configured, or the Firestore listener errors (e.g.
   `permission-denied`), it falls back to reading `alifinds_products_v1` from the browser's
   `localStorage` — data in this mode is per-browser only, not shared.
4. [components/AdminPanel.tsx](components/AdminPanel.tsx) lets an admin add a product manually,
   optionally auto-filling description/category via
   [services/geminiService.ts](services/geminiService.ts) (client-side Gemini call using the
   `API_KEY` env var, inlined into the client bundle by Vite — see `vite.config.ts`).

## Auth flow (admin)

- [components/Login.tsx](components/Login.tsx) checks username/password against
  `services/authService.ts` → `getAdminConfig()`, which reads `alifinds_admin_config_v1` from
  `localStorage` (default `admin` / `admin` if never changed).
- If 2FA is enabled, a second step verifies a 6-digit TOTP code
  (`otpauth` library, SHA1/30s/6-digit) against a per-browser stored secret.
- [components/AdminSettings.tsx](components/AdminSettings.tsx) lets the admin change
  username/password and enroll/disable 2FA (QR code generated client-side via `qrcode`).
- **Note:** this auth state lives entirely in `localStorage` on one browser/device — it is not a
  real multi-user auth system and does not gate the Firestore write rules on its own (Firestore
  security rules, if any, are configured separately in the Firebase project, not in this repo).

## Environment / deployment

- Hosted on Vercel: pushing to the connected GitHub branch builds the Vite frontend and deploys
  every file under `/api` as its own serverless function — no separate backend deploy step.
- Canonical environment variables live in Vercel Project Settings, not in the repo (see
  [README.md](README.md#configuration-variables) for the full list). Locally, `vercel env pull`
  is the recommended way to get a working `.env.local`.
- `vite.config.ts` inlines `API_KEY` into the client bundle (`process.env.API_KEY`) for
  [services/geminiService.ts](services/geminiService.ts); all `VITE_*` vars are inlined the same
  way for Firebase config. Everything else (AliExpress keys, `GEMINI_API_KEY`) stays server-side,
  read directly from `process.env` inside `/api` functions at request time.
