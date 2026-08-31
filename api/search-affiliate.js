import crypto from "crypto";
import { getAIProvider } from "./lib/aiProviders/index.js";

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
  const queryWords = tokenize(spec.rawQuery).filter((w) => !FILLER_WORDS.includes(w));
  if (queryWords.length) {
    const titleWords = new Set(tokenize(title));
    const matched = queryWords.filter((w) => titleWords.has(w)).length;
    score += (matched / queryWords.length) * 30;
  }

  // ===== 1️⃣ איכות כללית =====
  if (!Number.isNaN(rating)) {
    score += rating * 2; // איכות היא הכי חשוב
  }

  // ===== 2️⃣ ביקוש =====
  if (!Number.isNaN(volume)) {
    score += Math.log10(volume + 1) * 12;
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
    spec.queries = [
      `${q} anc`,
      `${q} tws anc`,
      `tws earbuds anc airpods pro 2`
    ];
    spec.mustHave = ["earbuds", "tws"];
    spec.niceToHave = ["anc", "noise cancelling", "low latency"];
  } else {
    spec.queries = [q];
  }

  return spec;
}

function simplifyQuery(query) {
  const filtered = tokenize(query).filter((w) => !SIMPLIFY_STOPWORDS.includes(w));

  return {
    original: query,
    short: filtered.slice(0, 3).join(" "),
    core: filtered.slice(0, 2).join(" ")
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
    data?.aliexpress_affiliate_product_query_response?.resp_result?.result?.products?.product ||
    [];

  return { products: Array.isArray(products) ? products : [], raw: data, url };
}

export default async function handler(req, res) {
  try {
    const rawQuery = (req.query.q || "test").toString().trim();
    const simplified = simplifyQuery(rawQuery);
    const debug = req.query.debug === "1";

    const appKey = process.env.ALIEXPRESS_APP_KEY;
    const secret = process.env.ALIEXPRESS_APP_SECRET;
    const trackingId = process.env.ALIEXPRESS_TRACKING_ID;

    if (!appKey || !secret || !trackingId) {
      return res.status(500).json({
        error: "Missing env vars",
        appKey: !!appKey,
        secret: !!secret,
        trackingId: !!trackingId
      });
    }

    // לשמור תאימות למה שעבד: US ברירת מחדל (אפשר להעביר ב-query)
    const shipTo = (req.query.ship_to_country || "US").toString().toUpperCase();
    const pageSize = Math.min(parseInt(req.query.page_size || "30", 10) || 30, 50);

    const deliveryDays = req.query.delivery_days ? String(req.query.delivery_days) : undefined;
    const minPrice = req.query.min_sale_price ? String(req.query.min_sale_price) : undefined;
    const maxPrice = req.query.max_sale_price ? String(req.query.max_sale_price) : undefined;

    const aiSpec = await refineWithAI(rawQuery);
    // חשוב: השאילתה המלאה של המשתמש, לא simplified.core/short (2-3 מילים בלבד) —
    // קיצוץ מוקדם היה זורק את רוב הספציפיות של החיפוש. simplified.short/core עדיין
    // משמשים רק כהרחבה (widening) אם יוצאות מעט תוצאות, ראה למטה.
    const spec = aiSpec || buildFallbackSpec(rawQuery);
    spec.rawQuery = rawQuery; // ל-scoreProduct, כדי לדרג לפי התאמת שאילתה-לכותרת

    console.log(
      `[search-affiliate] q="${rawQuery}" usedAI=${!!aiSpec} queries=${JSON.stringify(spec.queries)}`
    );

    const queries = (spec.queries && spec.queries.length ? spec.queries : [rawQuery]).slice(0, 3);

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
  const { products: fallbackProducts, raw, url } = await aliSearch({
    appKey,
    secret,
    trackingId,
    keywords: simplified.short,   // חיפוש קצר יותר
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
      return res.status(404).json({
        error: "No product found",
        ...(debug ? { lastUrl, lastRaw } : {})
      });
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
      return res.status(404).json({
        error: "No product found",
        ...(debug ? { lastUrl, lastRaw } : {})
      });
    }

   // בוחרים בצורה מגוונת מתוך הטופ 3
const chosen = pickWithBias(ranked, 6);

// top 3 נשאר ל-UI
const top6 = ranked.slice(0, 6).map(({ p, score }) => ({
  score,
  title: p.product_title,
  price: parseFloat(p.target_sale_price),
  currency: p.target_sale_price_currency,
  image: p.product_main_image_url,
  affiliate_link: p.promotion_link
}));

// תאימות אחורה – מוצר ראשי
const best = chosen ? {
  title: chosen.p.product_title,
  price: parseFloat(chosen.p.target_sale_price),
  currency: chosen.p.target_sale_price_currency,
  image: chosen.p.product_main_image_url,
  affiliate_link: chosen.p.promotion_link
} : top6[0];


    return res.json({
      // legacy fields (כמו שהיה אצלך)
      title: best.title,
      price: best.price,
      currency: best.currency,
      image: best.image,
      affiliate_link: best.affiliate_link,

      // new: top 3
      results: top6,

      ...(debug ? { meta: { inputQuery: rawQuery, usedAI: !!aiSpec, shipTo, usedQueries: queries, pageSize } } : {})
    });
  } catch (err) {
    console.error("search-affiliate failed:", err);
    return res.status(500).json({
      error: "search-affiliate crashed",
      message: err.message
    });
  }
}
