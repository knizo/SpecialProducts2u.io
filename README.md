<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Special-Products

Special-Products is an AliExpress affiliate deal-finder. A visitor types a search query
("wireless earbuds", "leather wallet"), the site queries the official **AliExpress
Affiliate API**, optionally refines the query with **Gemini AI** to filter out
accessories/irrelevant matches, ranks the results, and returns product cards with a
**tracked affiliate link** (your AliExpress Affiliate/Tracking ID embedded) that visitors
click to buy. An admin panel also lets you manually curate products, with Gemini
auto-generating marketing copy and a category.

- **Frontend:** React 18 + TypeScript + Vite, Tailwind (CDN)
- **Backend:** Vercel Serverless Functions (Node.js) in [`/api`](api)
- **Product data & images:** Firebase Firestore (falls back to browser `localStorage` if unconfigured)
- **Affiliate source:** AliExpress Open Platform Affiliate API (official API, not scraping)
- **AI:** Google Gemini (`gemini-3.6-flash`) for query refinement + copywriting
- **Hosting:** Vercel (frontend build + serverless API routes, deployed from GitHub)

For the full behavioral spec, system design, and open work items, see:
[SPECIFICATION.md](SPECIFICATION.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [TASKS.md](TASKS.md)

---

## Run Locally

**Prerequisites:** Node.js 18+, an AliExpress Affiliate (Open Platform) account, a Firebase
project (optional but recommended), and a Gemini API key.

1. Install dependencies:
   ```
   npm install
   ```
2. Pull environment variables from Vercel (recommended — this project's canonical `.env` lives
   in the Vercel project, not in the repo):
   ```
   npx vercel link
   npx vercel env pull .env.local
   ```
   Alternatively, create `.env.local` manually using the variable list below.
3. Run the app (frontend only; `/api/*` routes need `vercel dev` to execute locally):
   ```
   npx vercel dev
   ```
   or, for frontend-only work with the AliExpress routes disabled:
   ```
   npm run dev
   ```
4. Build for production:
   ```
   npm run build
   ```

## Configuration Variables

All variables are managed in the Vercel Project Settings → Environment Variables (Production /
Preview / Development). Nothing secret should ever be committed to the repo.

### AliExpress Affiliate API (required for search to work)

| Variable | Description |
|---|---|
| `ALIEXPRESS_APP_KEY` | App Key issued by the AliExpress Open Platform application. |
| `ALIEXPRESS_APP_SECRET` | App Secret used to MD5-sign every API request. **Server-only, never expose to the client.** |
| `ALIEXPRESS_TRACKING_ID` | Your Affiliate "Tracking ID" (a.k.a. PID sub-channel) — this is what attributes sales/commission back to you. Every generated link is embedded with this ID. |

### AI / Gemini (required for AI query refinement + admin auto-fill)

| Variable | Description |
|---|---|
| `API_KEY` | Gemini key used by the **frontend** admin panel (`services/geminiService.ts`) for description/category generation. |
| `GEMINI_API_KEY` | Gemini key used by the **backend** search route (`api/lib/aiProviders/gemini.js`) for query refinement. Can be the same key as `API_KEY`. |
| `AI_PROVIDER` | Which AI backend to use for query refinement. Default: `gemini`. |
| `AI_REFINE_ENABLED` | **Enabled by default.** Set to `0` to disable AI-based query refinement in `/api/search-affiliate` (falls back to the heuristic spec builder) — e.g. to cut Gemini cost/latency. Requires `GEMINI_API_KEY` to actually take effect; silently no-ops (falls back) if that key is missing. |
| `GEMINI_MODEL` | Optional override, default `gemini-3.6-flash`. |

### Firebase (optional — falls back to per-browser `localStorage` if unset)

| Variable | Description |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Web API key. |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain. |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID. |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket — hosts product images. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID. |
| `VITE_FIREBASE_APP_ID` | Firebase app ID. |

> All `VITE_*` variables are inlined into the client bundle at build time — do not put secrets
> in them. `ALIEXPRESS_APP_SECRET` and API keys without a `VITE_` prefix stay server-side only.

## Project Structure

```
/api                     Vercel serverless functions (Node.js)
  search-affiliate.js     Main search endpoint: query -> AliExpress results, ranked
  aliexpress-generate-link.js   Standalone deep-link generator for a known product URL
  aliexpress-test.js      Connectivity/credentials smoke test
  lib/aiProviders/        Pluggable AI query-refinement providers (gemini.js today)
/components               React UI components (ProductCard, AdminPanel, Login, ...)
/services                 Client-side data/auth/AI services (Firestore, Gemini, TOTP)
App.tsx, index.tsx         App shell / entry point
```

## Deployment

Push to the connected GitHub branch — Vercel builds the Vite frontend and deploys each file
in `/api` as an individual serverless function automatically. No separate backend deploy step
is required.
