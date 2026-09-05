# Open Tasks / Known Gaps

Findings from a full source read on 2026-09-05, not yet actioned. Not a roadmap of desired
features — just what's inconsistent or unfinished in the current code.

## Wiring gaps

- **Admin/Login/Settings views are unreachable.** `ViewState` (`types.ts`) includes `'admin' |
  'login' | 'settings'`, and `AdminPanel.tsx`, `Login.tsx`, and `AdminSettings.tsx` are fully
  built, but `App.tsx`'s `<main>` only ever renders the `'home'` branch — there is no button,
  link, or route that calls `setView('admin' | 'login' | 'settings')`, and no conditional render
  for those states. As shipped, there is no way to reach the admin panel from the UI at all.
- **`components/SearchBar.tsx` is dead code.** `App.tsx` has its own inline search form/handler
  (`handleAffiliateSearch`) that duplicates `SearchBar.tsx`'s purpose; `SearchBar` is not
  imported anywhere. Either wire it in and delete the duplicate logic, or delete the file.
- **`api/back_search-affiliate.js_back`** looks like a manual backup of an older
  `search-affiliate.js` left in the repo (unusual filename/extension, not `.js`). Worth deleting
  or moving out of `/api` — as-is it's harmless (Vercel won't route a non-`.js`-extension file
  the same way) but it's dead weight and confusing during review.

## Security / hardening

- **Admin credentials are plaintext in `localStorage`.** `types.ts` even flags this in a comment
  ("In a real app, this should be hashed. Storing plain for this demo."). Default is
  `admin`/`admin` until changed. Since this is a `localStorage`-only, per-browser auth gate (not
  a real backend-enforced auth system), it does not protect Firestore writes — actual write
  protection has to come from Firestore security rules configured in the Firebase project itself
  (not present in this repo). Confirm those rules exist before relying on this admin gate for
  anything beyond hiding the UI.
- No rate limiting on `/api/search-affiliate` — each request can trigger up to 4 AliExpress calls
  and 1 Gemini call; a scripted burst of requests could run up API costs quickly.

## Process / quality

- **No automated tests** anywhere in the repo (no test runner configured in `package.json`,
  no `*.test.*`/`*.spec.*` files). The ranking algorithm (`scoreProduct`) and query
  simplification/fallback logic in particular are prime candidates for unit tests given how much
  hand-tuned weighting logic they contain.
- `api/aliexpress-generate-link.js` hardcodes `tracking_id: "Electronics"` rather than reading
  `ALIEXPRESS_TRACKING_ID` from env like `search-affiliate.js` does — likely an oversight/left
  over from testing, worth confirming whether that's intentional.

## Documentation

- [README.md](README.md) references this file plus [SPECIFICATION.md](SPECIFICATION.md) and
  [ARCHITECTURE.md](ARCHITECTURE.md) — all three were missing from the repo until this pass;
  they've now been added to match the current code. Keep them in sync as the wiring gaps above
  get resolved.
