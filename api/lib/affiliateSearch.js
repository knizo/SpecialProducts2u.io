// api/lib/affiliateSearch.js
//
// Core AliExpress affiliate search: AI query refinement -> AliExpress product query
// -> dedupe -> accessory filter -> rerank. Extracted out of the HTTP route so that
// every entry point (the web route /api/search-affiliate, the Telegram bot, anything
// added later) shares one ranking implementation instead of copies that drift apart.
//
// This module does no HTTP-response work of its own — it returns a plain result object
// and lets each caller shape its own output.

import crypto from "crypto";
import { getAIProvider } from "./aiProviders/index.js";

const ALI_ENDPOINT = "https://api-sg.aliexpress.com/sync";

function cleanParams(obj) {
  // מוחק מפתחות עם undefined/null/"" כדי שלא יישלחו בכלל
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = v;
  }
  return out;
}

function sign(secret, params) {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join("");

  return crypto
    .createHash("md5")
    .update(secret + sorted + secret)
    .digest("hex")
    .toUpperCase();
}

// מסנן אביזרים נפוצים (קייסים וכו')
function defaultExcludeForQuery() {
  return [
    "case",
    "cover",
    "silicone",
    "replacement",
    "strap",
    "ear tips",
    "earpads",
    "for airpods",
    "compatible with",
    "charging case",
    "skin",
    "protector"
  ];
}

// מילות-מילוי כלליות, חסרות משמעות לצורך התאמת שאילתה-לכותרת
const FILLER_WORDS = ["for", "with", "and", "or", "to", "of", "best", "cheap", "quality", "new"];
// stopwords לצורך קיצור שאילתה בלבד (broadening) — גם שמות מותג/פלטפורמה, כי שם הם רק "רעש" שמבזבז תקציב מילים
const SIMPLIFY_STOPWORDS = [...FILLER_WORDS, "iphone", "android"];

function tokenize(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

function scoreProduct(product, spec) {
  let score = 0;

  const title = (product?.product_title || "").toLowerCase();

  const price = parseFloat(product?.target_sale_price || "0");
  const rating = parseFloat(product?.evaluate_rate || "0");
  const volume = parseInt(product?.lastest_volume || "0");
  const commission = parseFloat(product?.commission_rate || "0");

  // ===== 0️⃣ התאמה לשאילתה המקורית — האיתות הכי חשוב לדיוק =====
  // בלי זה, כותרת לא-קשורה עם rating/volume גבוהים יכולה לנצח מוצר מדויק.
  const queryWords = tokenize(spec.scoreQuery).filter((w) => !FILLER_WORDS.includes(w));
  if (queryWords.length) {
    const titleWords = new Set(tokenize(title));
    const matched = queryWords.filter((w) => titleWords.has(w));
    const matchRatio = matched.length / queryWords.length;
    score += matchRatio * 55;

    // Tokens with a digit (model codes / part numbers, e.g. "gs3", "rtx4090") are the
    // strongest possible signal that this is literally the right item — a generic
    // word like "bushing" or "case" matches thousands of unrelated products, but a
    // model code matching is close to conclusive. Reward it well beyond the ratio above.
    const matchedCodes = matched.filter((w) => /\d/.test(w));
    score += matchedCodes.length * 10;

    // A query with several meaningful words where most DON'T appear in the title is
    // very likely the wrong product, no matter how well it sells elsewhere — this is
    // what stops an unrelated bestseller from beating a real (but low-volume) match.
    // Gated on queryWords.length so short/generic queries (1-2 words) aren't penalized
    // just for legitimately matching broadly.
    if (queryWords.length >= 3 && matchRatio < 0.34) {
      score -= 40;
    }
  }

  // ===== 1️⃣ איכות כללית =====
  if (!Number.isNaN(rating)) {
    score += rating * 2; // איכות היא הכי חשוב
  }

  // ===== 2️⃣ ביקוש =====
  if (!Number.isNaN(volume)) {
    score += Math.log10(volume + 1) * 8;
  }

  // ===== 3️⃣ רווחיות =====
  if (!Number.isNaN(commission)) {
    score += commission * 2;
  }

  // ===== 4️⃣ מחיר הגיוני =====
  if (price > 0) {
    if (spec.price?.min != null && price < spec.price.min) score -= 10;
    if (spec.price?.max != null && price > spec.price.max) score -= 10;

    // מחיר חשוד (זול מדי)
    if (price < 3) score -= 25;
  }

  // ===== 5️⃣ ניקיון כותרת — רק סימנים שליליים אוניברסליים =====
  // "case"/"cover"/"for "/"compatible with" הוסרו מכאן: הן מחרוזות נפוצות בכותרות
  // לגיטימיות לגמרי (למשל "Gift for Her", "Perfect for daily use") והענישו תוצאות
  // תקינות. סינון אביזרים ספציפי לשאילתה עדיין קורה למטה, דרך spec.exclude.
  const globalExclude = ["refurbished", "used", "copy", "replica", "fake"];

  for (const w of globalExclude) {
    if (title.includes(w)) score -= 30;
  }

  // ===== 6️⃣ must / nice (אם קיימים) =====
  for (const w of spec.mustHave || []) {
    if (title.includes(String(w).toLowerCase())) score += 10;
  }

  for (const w of spec.niceToHave || []) {
    if (title.includes(String(w).toLowerCase())) score += 4;
  }

  // ===== 7️⃣ התאמה רכה לסוג מוצר (אופציונלי) =====
  if (spec.productType) {
    if (title.includes(spec.productType.replace("_", " "))) {
      score += 4;
    }
  }
  // 🌀 רעש קטן לגיוון — קטן מספיק שלא יהפוך תוצאות רחוקות לתוצאות קרובות
  score += Math.random() * 2;

  return score;
}

function pickWithBias(rankedItems, k = 3) {
  const top = rankedItems.slice(0, k);
  if (!top.length) return null;

  // משקל יורד: מקום 1 > מקום 2 > מקום 3
  const weights = top.map((_, i) => k - i);
  const sum = weights.reduce((a, b) => a + b, 0);

  let r = Math.random() * sum;
  for (let i = 0; i < top.length; i++) {
    r -= weights[i];
    if (r <= 0) return top[i];
  }
  return top[0];
}

async function refineWithAI(rawQuery) {
  // ברירת מחדל: מופעל. אפשר לכבות עם AI_REFINE_ENABLED=0 (למשל לחיסכון בעלויות).
  if (process.env.AI_REFINE_ENABLED === "0") return null;

  const provider = getAIProvider();
  if (!provider) return null;

  try {
    const spec = await provider.refineQuery(rawQuery);
    return spec; // null if the provider failed — caller already falls back cleanly
  } catch (err) {
    console.error("AI refine failed, falling back to heuristic spec:", err.message);
    return null;
  }
}

// How many top-ranked candidates the AI is asked to check. More catches good matches
// that keyword scoring ranked low, at the cost of a bigger prompt.
const VERIFY_CANDIDATES = 15;

// Minimum AI relevance score (0-10) a product needs to be shown. Raise it for stricter
// results; lower it if too many searches come back empty. Set via AI_VERIFY_MIN_SCORE.
function getVerifyMinScore() {
  const value = Number(process.env.AI_VERIFY_MIN_SCORE);
  return Number.isFinite(value) && process.env.AI_VERIFY_MIN_SCORE !== ""
    ? Math.max(0, Math.min(10, value))
    : 6;
}

// Ask the AI to score how well each top candidate actually matches the query. Keyword
// scoring can't tell "4G camera with SIM" from "4G SIM router" — they share the words —
// but the AI can. Returns { candidates, scores } or null if the check didn't run, in
// which case the caller keeps the keyword ranking unchanged.
async function verifyWithAI(rawQuery, ranked) {
  if (process.env.AI_VERIFY_ENABLED === "0") return null;

  const provider = getAIProvider();
  if (!provider) return null;

  const candidates = ranked.slice(0, VERIFY_CANDIDATES);
  try {
    const scores = await provider.verifyResults(
      rawQuery,
      candidates.map(({ p }) => p.product_title)
    );
    return scores ? { candidates, scores } : null;
  } catch (err) {
    console.error("AI verify failed, keeping keyword ranking:", err.message);
    return null;
  }
}

function buildFallbackSpec(query) {
  const q = String(query || "").trim();
  const lower = q.toLowerCase();
  const isAirpodsLike =
    lower.includes("airpods") || lower.includes("air pods") || lower.includes("airpod");

  const spec = {
    productType: isAirpodsLike ? "wireless_earbuds" : "generic",
    queries: [],
    mustHave: [],
    niceToHave: [],
    exclude: defaultExcludeForQuery(),
    price: isAirpodsLike ? { min: 20, max: 250 } : null,
    // undefined -> AliExpress ישתמש במיון הרלוונטיות הפנימי שלו במקום להיכפות
    // תמיד למיון לפי וליום מכירות; הדירוג שלנו (scoreProduct) כבר מביא volume בחשבון.
    sortPreference: undefined
  };

  if (isAirpodsLike) {
    spec.queries = [`${q} anc`, `${q} tws anc`, `tws earbuds anc airpods pro 2`];
    spec.mustHave = ["earbuds", "tws"];
    spec.niceToHave = ["anc", "noise cancelling", "low latency"];
  } else {
    spec.queries = [q];
  }

  return spec;
}

function simplifyQuery(query, mustHave = []) {
  // Preserve original capitalization per word (before tokenize()'s lowercasing) so we
  // can use "was this Capitalized in the sentence the user typed" as a weak brand-name
  // signal below — tokenize() alone throws that information away.
  const rawWords = String(query || "").trim().split(/\s+/).filter(Boolean);
  const filtered = rawWords
    .map((raw) => ({ raw, clean: raw.toLowerCase().replace(/[^a-z0-9]/g, "") }))
    .filter(({ clean }) => clean && !SIMPLIFY_STOPWORDS.includes(clean));

  // mustHave often already contains exactly the brand/model terms the AI identified as
  // essential (see shared.js's prompt) — trust that over any lexical guess.
  const mustHaveTokens = new Set((mustHave || []).flatMap((m) => tokenize(String(m))));

  // Widening used to just take the first N words — for a query like "Original Lower
  // Suspension Rubber Bushing ... GAC Trumpchi GS3 GE3" that keeps "original lower
  // suspension" and throws away the actual product noun and every brand/model code.
  // Prefer, in order: AI-identified mustHave terms, then tokens with a digit (model/part
  // codes), then tokens capitalized in the original sentence (a weak brand-name signal —
  // unreliable on its own for Title-Case queries where every word is capitalized, which
  // is why it's the last resort rather than the primary signal), then longer words.
  // Keep survivors in their original relative order so the phrase still reads naturally
  // to AliExpress's own search.
  const pick = (n) =>
    filtered
      .map(({ raw, clean }, i) => {
        const weight =
          (mustHaveTokens.has(clean) ? 200 : 0) +
          (/\d/.test(clean) ? 100 : 0) +
          (/^[A-Z]/.test(raw) ? 20 : 0) +
          clean.length;
        return { w: clean, i, weight };
      })
      .sort((a, b) => b.weight - a.weight)
      .slice(0, n)
      .sort((a, b) => a.i - b.i)
      .map((t) => t.w)
      .join(" ");

  return {
    original: query,
    short: pick(4),
    core: pick(2)
  };
}

async function aliSearch({
  appKey,
  secret,
  trackingId,
  keywords,
  shipTo,
  pageSize,
  pageNo,
  targetCurrency,
  targetLanguage,
  minPrice,
  maxPrice,
  deliveryDays,
  sort
}) {
  // בונים פרמטרים בסיסיים
  let params = {
    app_key: appKey,
    method: "aliexpress.affiliate.product.query",
    timestamp: Date.now(),
    format: "json",
    sign_method: "md5",
    keywords,
    tracking_id: trackingId,
    page_no: pageNo,
    page_size: pageSize,
    target_currency: targetCurrency,
    target_language: targetLanguage,
    ship_to_country: shipTo,

    // אופציונליים — יימחקו אם undefined
    min_sale_price: minPrice,
    max_sale_price: maxPrice,
    delivery_days: deliveryDays,
    sort
  };

  // ✅ קריטי: לנקות לפני חתימה ולפני URL
  params = cleanParams(params);

  params.sign = sign(secret, params);

  const url = `${ALI_ENDPOINT}?${new URLSearchParams(params).toString()}`;
  const response = await fetch(url);
  const data = await response.json();

  const products =
    data?.aliexpress_affiliate_product_query_response?.resp_result?.result?.products?.product || [];

  return { products: Array.isArray(products) ? products : [], raw: data, url };
}

/**
 * Swap product.query's long `/s/...` promotion links for short `/e/...` ones via
 * aliexpress.affiliate.link.generate — one batched call for all items.
 *
 * Returns a Map of productId -> short link. Any failure (timeout, empty result, an item
 * AliExpress won't link) just leaves that item out of the map, so callers keep the
 * original long link for it: shortening is cosmetic and must never break a search.
 */
async function generateShortLinks({ appKey, secret, trackingId, productIds }) {
  const shortLinks = new Map();
  const ids = productIds.filter(Boolean);
  if (!ids.length) return shortLinks;

  let params = {
    app_key: appKey,
    method: "aliexpress.affiliate.link.generate",
    timestamp: Date.now().toString(),
    format: "json",
    sign_method: "md5",
    v: "2.0",
    promotion_link_type: "0", // standard commission link (2 = hot-product commission)
    source_values: ids.map((id) => `https://www.aliexpress.com/item/${id}.html`).join(","),
    tracking_id: trackingId
  };
  params = cleanParams(params);
  params.sign = sign(secret, params);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${ALI_ENDPOINT}?${new URLSearchParams(params).toString()}`, {
      signal: controller.signal
    });
    const data = await response.json();

    const links =
      data?.aliexpress_affiliate_link_generate_response?.resp_result?.result?.promotion_links
        ?.promotion_link || [];

    // Match results back by the item ID inside source_value rather than by array
    // position or exact URL string, since AliExpress may reorder or normalize them.
    for (const entry of Array.isArray(links) ? links : []) {
      const id = String(entry?.source_value || "").match(/item\/(\d+)\.html/)?.[1];
      if (id && entry?.promotion_link) shortLinks.set(id, entry.promotion_link);
    }

    if (!shortLinks.size) {
      console.warn("[affiliateSearch] link.generate returned no short links:", JSON.stringify(data).slice(0, 500));
    }
  } catch (err) {
    console.error("[affiliateSearch] link.generate failed, keeping long links:", err.message);
  } finally {
    clearTimeout(timeout);
  }

  return shortLinks;
}

/**
 * Run a full affiliate search.
 *
 * Never throws for expected conditions — returns a tagged result instead, so each
 * caller (HTTP route, Telegram bot) can map it to its own output format:
 *   { ok: false, reason: "missing_env", have: {...} }
 *   { ok: false, reason: "no_results", lastUrl, lastRaw, meta }
 *   { ok: false, reason: "no_close_match", lastUrl, lastRaw, meta }  (AI rejected every
 *     candidate as below AI_VERIFY_MIN_SCORE; meta.verify.closest lists the near-misses)
 *   { ok: true, best, results, meta }
 *
 * `meta` (inputQuery, usedAI, shipTo, usedQueries, pageSize, and widenedTo if the
 * widening fallback fired) is included on `no_results` too, not just success — a dead-end
 * search is otherwise a black box: without it you can't tell whether AI refinement ran,
 * what queries were actually sent to AliExpress, or whether widening kicked in.
 *
 * `best` is the weighted-random pick among the top results (kept for the website, which
 * wants some variety between identical searches). `results[0]` is always the strictly
 * top-ranked product — use that when accuracy matters more than variety.
 */
export async function searchAffiliate({
  query,
  shipTo = "US",
  pageSize = 30,
  minPrice,
  maxPrice,
  deliveryDays,
  shortenLinks = false
} = {}) {
  const rawQuery = String(query || "").trim();

  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const secret = process.env.ALIEXPRESS_APP_SECRET;
  const trackingId = process.env.ALIEXPRESS_TRACKING_ID;

  if (!appKey || !secret || !trackingId) {
    return {
      ok: false,
      reason: "missing_env",
      have: { appKey: !!appKey, secret: !!secret, trackingId: !!trackingId }
    };
  }

  const aiSpec = await refineWithAI(rawQuery);
  // חשוב: השאילתה המלאה של המשתמש, לא simplified.core/short (2-3 מילים בלבד) —
  // קיצוץ מוקדם היה זורק את רוב הספציפיות של החיפוש. simplified.short/core עדיין
  // משמשים רק כהרחבה (widening) אם יוצאות מעט תוצאות, ראה למטה.
  const spec = aiSpec || buildFallbackSpec(rawQuery);

  // The text scoreProduct compares against (English) product titles. tokenize() keeps
  // only a-z/0-9, so a Hebrew query tokenizes to nothing and relevance scoring would
  // silently switch off — use the AI's English translation (matchQuery) when there is
  // one. Without AI there's no translation, so a Hebrew query stays poorly matched.
  spec.scoreQuery = spec.matchQuery || rawQuery;

  // Computed after spec so widening can prioritize the AI's own identified brand/model
  // terms (spec.mustHave) over a lexical guess — see simplifyQuery()'s comment. Also
  // English-based, for the same Hebrew reason as above.
  const simplified = simplifyQuery(spec.scoreQuery, spec.mustHave);

  console.log(
    `[affiliateSearch] q="${rawQuery}" shipTo=${shipTo} usedAI=${!!aiSpec} queries=${JSON.stringify(
      spec.queries
    )}`
  );

  const queries = (spec.queries && spec.queries.length ? spec.queries : [rawQuery]).slice(0, 3);

  // Built once and reused on both the failure and success paths, so a "no results" case
  // is just as debuggable (with ?debug=1) as a successful one — previously this was only
  // returned on success, making a dead-end search a black box in the logs.
  const meta = {
    inputQuery: rawQuery,
    matchQuery: spec.matchQuery || null,
    usedAI: !!aiSpec,
    shipTo,
    usedQueries: queries,
    pageSize
  };

  const all = [];
  let lastRaw = null;
  let lastUrl = null;

  for (const q of queries) {
    const { products, raw, url } = await aliSearch({
      appKey,
      secret,
      trackingId,
      keywords: q,
      shipTo,
      pageSize,
      pageNo: 1,
      targetCurrency: "USD",
      targetLanguage: "EN",
      minPrice,
      maxPrice,
      deliveryDays,
      sort: spec.sortPreference || undefined
    });

    lastRaw = raw;
    lastUrl = url;
    all.push(...products);
  }

  // 🔁 FALLBACK: אם יצאו מעט תוצאות – מרחיבים את החיפוש
  if (all.length < 5 && simplified?.short && simplified.short !== simplified.original) {
    meta.widenedTo = simplified.short; // visible in debug output either way it ends up

    const { products: fallbackProducts, raw, url } = await aliSearch({
      appKey,
      secret,
      trackingId,
      keywords: simplified.short, // חיפוש קצר יותר
      shipTo,
      pageSize,
      pageNo: 1,
      targetCurrency: "USD",
      targetLanguage: "EN",
      sort: spec.sortPreference || undefined
    });

    lastRaw = raw;
    lastUrl = url;
    all.push(...fallbackProducts);
  }

  // Deduplicate
  const seen = new Set();
  const uniq = [];
  for (const p of all) {
    const key = p.product_id || `${p.product_title}|${p.product_main_image_url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(p);
  }

  if (!uniq.length) {
    // אם יש בעיה ב-sign/פרמטרים - פה נראה את זה עם debug=1
    return { ok: false, reason: "no_results", lastUrl, lastRaw, meta };
  }

  // Filter accessories
  const exclude = (spec.exclude || []).map((x) => String(x).toLowerCase());
  const filtered = uniq.filter((p) => {
    const t = `${p.product_title || ""}`.toLowerCase();
    return !exclude.some((w) => w && t.includes(w));
  });

  // Rerank
  const ranked = (filtered.length ? filtered : uniq)
    .map((p) => ({ p, score: scoreProduct(p, spec) }))
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    return { ok: false, reason: "no_results", lastUrl, lastRaw, meta };
  }

  // AI relevance check: keep only candidates the AI scores >= the minimum, best first.
  // Showing fewer real matches beats padding the list with wrong products.
  let finalRanked = ranked;
  const verification = await verifyWithAI(rawQuery, ranked);

  if (verification) {
    const { candidates, scores } = verification;
    const minScore = getVerifyMinScore();
    const scored = candidates.map((c, i) => ({ ...c, aiScore: scores[i] }));

    // Products the AI skipped (null score) are treated as not matching.
    const kept = scored
      .filter((c) => c.aiScore !== null && c.aiScore >= minScore)
      .sort((a, b) => b.aiScore - a.aiScore || b.score - a.score);

    meta.verify = { ran: true, minScore, checked: candidates.length, kept: kept.length };

    if (!kept.length) {
      // Show what nearly made it, so AI_VERIFY_MIN_SCORE can be tuned from ?debug=1.
      meta.verify.closest = scored
        .filter((c) => c.aiScore !== null)
        .sort((a, b) => b.aiScore - a.aiScore)
        .slice(0, 5)
        .map((c) => ({ title: c.p.product_title, aiScore: c.aiScore }));
      return { ok: false, reason: "no_close_match", lastUrl, lastRaw, meta };
    }

    finalRanked = kept;
  } else {
    meta.verify = { ran: false };
  }

  // בוחרים בצורה מגוונת מתוך הטופ
  const chosen = pickWithBias(finalRanked, 6);

  const top = finalRanked.slice(0, 6);

  const shortLinks = shortenLinks
    ? await generateShortLinks({
        appKey,
        secret,
        trackingId,
        // `chosen` is always one of these six (pickWithBias draws from the top 6).
        productIds: top.map(({ p }) => String(p.product_id || ""))
      })
    : new Map();
  meta.shortenedLinks = shortenLinks ? shortLinks.size : 0;

  const linkFor = (p) => shortLinks.get(String(p.product_id || "")) || p.promotion_link;

  const top6 = top.map(({ p, score, aiScore }) => ({
    score,
    aiScore: aiScore ?? null,
    productId: p.product_id,
    title: p.product_title,
    price: parseFloat(p.target_sale_price),
    currency: p.target_sale_price_currency,
    image: p.product_main_image_url,
    affiliate_link: linkFor(p)
  }));

  const best = chosen
    ? {
        productId: chosen.p.product_id,
        title: chosen.p.product_title,
        price: parseFloat(chosen.p.target_sale_price),
        currency: chosen.p.target_sale_price_currency,
        image: chosen.p.product_main_image_url,
        affiliate_link: linkFor(chosen.p)
      }
    : top6[0];

  return {
    ok: true,
    best,
    results: top6,
    meta
  };
}
