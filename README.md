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

### AI query refinement (backend, `/api/search-affiliate`)

Query refinement runs through a pluggable provider switchboard
(`api/lib/aiProviders/index.js`) — switching models is just an env var, no code change.
**Groq is the default** (it's free and the spec-extraction task here doesn't need a frontier
model); Gemini and OpenRouter are available as alternatives today, and adding OpenAI/ChatGPT or
any other provider is a small drop-in file (see the comment at the top of `index.js`).

| Variable | Description |
|---|---|
| `AI_PROVIDER` | Which backend to use for query refinement. Default: `groq`. Set to `gemini` or `openrouter` to switch. |
| `GROQ_API_KEY` | API key for [Groq](https://console.groq.com) — used when `AI_PROVIDER=groq` (the default). Free tier available. |
| `GROQ_MODEL` | Optional override, default `openai/gpt-oss-20b`. Groq's model lineup changes fairly often — if you get a `model_not_found` error, check console.groq.com's Playground (Models list) or `curl -s https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"` for what's actually enabled for your key, and set `GROQ_MODEL` to one of those (e.g. `openai/gpt-oss-120b` for higher quality/slower). |
| `GEMINI_API_KEY` | Gemini key used when `AI_PROVIDER=gemini`. |
| `GEMINI_MODEL` | Optional override, default `gemini-3.6-flash`. |
| `OPENROUTER_API_KEY` | API key from [OpenRouter](https://openrouter.ai/keys) — used when `AI_PROVIDER=openrouter`. |
| `OPENROUTER_MODEL` | Optional override, default `qwen/qwen3.8-27b:free`. That free model caps at **200 requests/day** — past that it fails over to the heuristic spec builder like any other provider error, until the daily quota resets. Browse [openrouter.ai/models](https://openrouter.ai/models) for a paid alternative if you outgrow it. |
| `AI_REFINE_ENABLED` | **Enabled by default.** Set to `0` to disable AI-based query refinement in `/api/search-affiliate` (falls back to the heuristic spec builder) — e.g. to cut cost/latency. Silently no-ops (falls back) if the active provider's API key is missing. |

### AI admin auto-fill (frontend, admin panel)

| Variable | Description |
|---|---|
| `API_KEY` | Gemini key used by the **frontend** admin panel (`services/geminiService.ts`) for description/category generation. Independent of the backend search refinement above — currently Gemini-only, since it calls the `@google/genai` SDK directly rather than going through the provider switchboard. |

### Firebase (optional — falls back to per-browser `localStorage` if unset)

| Variable | Description |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Web API key. |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain. |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID. |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket — hosts product images. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID. |
| `VITE_FIREBASE_APP_ID` | Firebase app ID. |

### Telegram bot (optional — only needed if you run the group bot)

| Variable | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot token from [@BotFather](https://t.me/BotFather). Required for the bot to reply. |
| `TELEGRAM_WEBHOOK_SECRET` | Shared secret passed to `setWebhook` as `secret_token`; Telegram echoes it back on every request and the webhook rejects anything else. Strongly recommended — the webhook URL is public. |
| `TELEGRAM_TRIGGER` | Optional bare trigger word/phrase, e.g. `deal:` → `deal: wireless earbuds`. Requires turning **off** Group Privacy in BotFather (see below). The `/deal`, `/find`, `/ali` commands always work regardless. |
| `TELEGRAM_SHIP_TO` | Two-letter country the bot searches for, default `US`. Unlike the website there is no visitor IP to geolocate here, so set this to your group's country (e.g. `IL`). |

> All `VITE_*` variables are inlined into the client bundle at build time — do not put secrets
> in them. `ALIEXPRESS_APP_SECRET` and API keys without a `VITE_` prefix stay server-side only.

## Telegram Bot Setup

The bot listens in a group and replies **only** when explicitly asked — either with a command
(`/deal wireless earbuds`) or with your own trigger word (`deal: wireless earbuds`). Everything
else in the group is ignored.

1. Create the bot with [@BotFather](https://t.me/BotFather) (`/newbot`) and copy the token into
   `TELEGRAM_BOT_TOKEN` in Vercel.
2. Pick any random string as `TELEGRAM_WEBHOOK_SECRET` and set it in Vercel too.
3. Deploy, then register the webhook once (replace the placeholders):
   ```
   https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<your-domain>/api/telegram-webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
   ```
   Open that URL in a browser — you should get `{"ok":true,...}`.
4. Add the bot to your group.
5. **Only if you want the bare trigger word** (`deal: ...`) instead of `/deal ...`: in BotFather
   go to `/mybots` → your bot → *Bot Settings* → *Group Privacy* → **Turn off**, then remove and
   re-add the bot to the group. With privacy ON (Telegram's default) a bot only receives
   commands, @-mentions, and replies to itself — which is why `/deal` works with no extra setup.

To check what's registered: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`.
To stop the bot: `https://api.telegram.org/bot<TOKEN>/deleteWebhook`.

## Project Structure

```
/api                     Vercel serverless functions (Node.js)
  search-affiliate.js     HTTP entry point for the website search box
  telegram-webhook.js     Telegram group bot (replies with the tracked affiliate link)
  aliexpress-generate-link.js   Standalone deep-link generator for a known product URL
  aliexpress-test.js      Connectivity/credentials smoke test
  lib/affiliateSearch.js  Shared search core (AI refine -> AliExpress query -> rank)
  lib/aiProviders/        Pluggable AI query-refinement providers (groq.js, gemini.js)
/components               React UI components (ProductCard, AdminPanel, Login, ...)
/services                 Client-side data/auth/AI services (Firestore, Gemini, TOTP)
App.tsx, index.tsx         App shell / entry point
```

## Deployment

Push to the connected GitHub branch — Vercel builds the Vite frontend and deploys each file
in `/api` as an individual serverless function automatically. No separate backend deploy step
is required.
