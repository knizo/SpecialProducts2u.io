import crypto from "crypto";
import fetch from "node-fetch";

const ALI_ENDPOINT = "https://api-sg.aliexpress.com/sync";

function sign(secret, params) {
  const sorted = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join("");

  return crypto
    .createHash("md5")
    .update(secret + sorted + secret)
    .digest("hex")
    .toUpperCase();
}

// מילות סינון ברירת מחדל נגד "אביזרים" (הרבה פעמים זה הורס את הרלוונטיות)
function defaultExcludeForQuery(q) {
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

// דירוג תוצאה: בונוס למילות מפתח חשובות, קנס כבד לאביזרים
function scoreProduct(product, spec) {
  const title = (product?.product_title || "").toLowerCase();
  const text = title; // לרוב מספיק. אם תרצה להוסיף תיאור - תלוי ב-API אם מחזיר.

  const mustHave = spec.mustHave || [];
  const niceToHave = spec.niceToHave || [];
  const exclude = spec.exclude || [];

  let score = 0;

  for (const w of exclude) {
    if (!w) continue;
    if (text.includes(String(w).toLowerCase())) score -= 25;
  }

  for (const w of mustHave) {
    if (!w) continue;
    if (text.includes(String(w).toLowerCase())) score += 12;
  }

  for (const w of niceToHave) {
    if (!w) continue;
    if (text.includes(String(w).toLowerCase())) score += 4;
  }

  const price = parseFloat(product?.target_sale_price);
  if (spec.price?.min != null && !Number.isNaN(price) && price < spec.price.min) score -= 8;
  if (spec.price?.max != null && !Number.isNaN(price) && price > spec.price.max) score -= 8;

  // בונוסים כלליים לאוזניות
  if (spec.productType === "wireless_earbuds") {
    if (text.includes("earbud")) score += 3;
    if (text.includes("tws")) score += 3;
    if (text.includes("anc") || text.includes("noise cancel")) score += 3;
  }

  return score;
}

// אופציונלי: אם תרצה לחבר AI אמיתי בעתיד – כאן המקום.
// כרגע מחזיר null כדי לא לשבור כלום.
async function refineWithAI(query) {
  if (process.env.AI_REFINE_ENABLED !== "1") return null;
  return null;
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
    exclude: defaultExcludeForQuery(q),
    price: isAirpodsLike ? { min: 20, max: 250 } : null,
    sortPreference: "LAST_VOLUME_DESC"
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

// קריאה ל-AliExpress affiliate product query
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
  const params = {
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

    // אופציונלי (אם ה-API שלך תומך): פילטרים
    min_sale_price: minPrice,
    max_sale_price: maxPrice,
    delivery_days: deliveryDays,
    sort
  };

  params.sign = sign(secret, params);

  const url = `${ALI_ENDPOINT}?${new URLSearchParams(params).toString()}`;
  const response = await fetch(url);
  const data = await response.json();

  const products =
    data?.aliexpress_affiliate_product_query_response?.resp_result?.result?.products?.product ||
    [];

  return Array.isArray(products) ? products : [];
}

export default async function handler(req, res) {
  try {
    const query = (req.query.q || "test").toString().trim();

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

    // כדי לא לשבור מה שעבד אצלך: ברירת מחדל נשארת US כמו קודם,
    // אבל אפשר להעביר ship_to_country מהקליינט.
    const shipTo = (req.query.ship_to_country || "US").toString().toUpperCase();

    // יותר גדול מ-1 כדי שתוכל לבחור “הכי טוב”.
    const pageSize = Math.min(parseInt(req.query.page_size || "30", 10) || 30, 50);

    // אופציונלי פילטרים (אם תרצה בעתיד)
    const deliveryDays = req.query.delivery_days ? String(req.query.delivery_days) : undefined;
    const minPrice = req.query.min_sale_price ? String(req.query.min_sale_price) : undefined;
    const maxPrice = req.query.max_sale_price ? String(req.query.max_sale_price) : undefined;

    // 1) Build spec (AI או fallback)
    const aiSpec = await refineWithAI(query);
    const spec = aiSpec || buildFallbackSpec(query);

    // 2) Run multiple searches and merge
    const queries = (spec.queries && spec.queries.length ? spec.queries : [query]).slice(0, 3);

    const all = [];
    for (const q of queries) {
      const list = await aliSearch({
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
        sort: spec.sortPreference || "LAST_VOLUME_DESC"
      });
      all.push(...list);
    }

    // 3) Deduplicate
    const seen = new Set();
    const uniq = [];
    for (const p of all) {
      const key = p.product_id || `${p.product_title}|${p.product_main_image_url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(p);
    }

    if (!uniq.length) {
      return res.status(404).json({ error: "No product found" });
    }

    // 4) Filter accessories by exclude list
    const exclude = (spec.exclude || []).map((x) => String(x).toLowerCase());
    const filtered = uniq.filter((p) => {
      const t = `${p.product_title || ""}`.toLowerCase();
      return !exclude.some((w) => w && t.includes(w));
    });

    // 5) Rerank and take TOP 3
    const ranked = (filtered.length ? filtered : uniq)
      .map((p) => ({ p, score: scoreProduct(p, spec) }))
      .sort((a, b) => b.score - a.score);

    if (!ranked.length) {
      return res.status(404).json({ error: "No product found" });
    }

    const top3 = ranked.slice(0, 3).map(({ p, score }) => ({
      score,
      title: p.product_title,
      price: parseFloat(p.target_sale_price),
      currency: p.target_sale_price_currency,
      image: p.product_main_image_url,
      affiliate_link: p.promotion_link
    }));

    // ✅ תאימות אחורה: מחזיר גם שדות "ישנים" לתוצאה הראשונה
    const best = top3[0];

    return res.json({
      // legacy (כמו שהקליינט שלך מצפה היום)
      title: best.title,
      price: best.price,
      currency: best.currency,
      image: best.image,
      affiliate_link: best.affiliate_link,

      // new: top 3
      results: top3,

      meta: {
        inputQuery: query,
        shipTo,
        usedQueries: queries,
        pageSize
      }
    });
  } catch (err) {
    console.error("search-affiliate failed:", err);
    return res.status(500).json({
      error: "search-affiliate crashed",
      message: err.message
    });
  }
}
