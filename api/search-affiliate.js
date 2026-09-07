// api/search-affiliate.js
//
// HTTP entry point for the website's search box. All the actual search/ranking work
// lives in api/lib/affiliateSearch.js so the Telegram bot can reuse the exact same
// logic — this file only maps query params in and JSON/status codes out.

import { searchAffiliate } from "./lib/affiliateSearch.js";

export default async function handler(req, res) {
  try {
    const rawQuery = (req.query.q || "test").toString().trim();
    const debug = req.query.debug === "1";

    // ברירת מחדל: המדינה האמיתית של המבקר (Vercel שולח x-vercel-ip-country אוטומטית
    // בפרודקשן), ורק אם אין את זה (למשל בפיתוח מקומי) נופלים ל-US. חיוני: אם תמיד
    // מבקשים "US" בזמן שהמבקר בפועל נמצא במדינה אחרת, ה-API עלול להחזיר מוצרים
    // שזמינים למשלוח ל-US אבל לא ל-region האמיתי של המבקר — ואז הקישור נשבר עם
    // "not eligible for the affiliate program or not available in your region" בלחיצה.
    const geoCountry = (req.headers["x-vercel-ip-country"] || "").toString().toUpperCase();
    const shipTo = (req.query.ship_to_country || geoCountry || "US").toString().toUpperCase();
    const pageSize = Math.min(parseInt(req.query.page_size || "30", 10) || 30, 50);

    const deliveryDays = req.query.delivery_days ? String(req.query.delivery_days) : undefined;
    const minPrice = req.query.min_sale_price ? String(req.query.min_sale_price) : undefined;
    const maxPrice = req.query.max_sale_price ? String(req.query.max_sale_price) : undefined;

    const result = await searchAffiliate({
      query: rawQuery,
      shipTo,
      pageSize,
      minPrice,
      maxPrice,
      deliveryDays
    });

    if (!result.ok && result.reason === "missing_env") {
      return res.status(500).json({
        error: "Missing env vars",
        ...result.have
      });
    }

    if (!result.ok) {
      // אם יש בעיה ב-sign/פרמטרים - פה נראה את זה עם debug=1
      return res.status(404).json({
        error: "No product found",
        ...(debug ? { lastUrl: result.lastUrl, lastRaw: result.lastRaw } : {})
      });
    }

    const { best, results, meta } = result;

    return res.json({
      // legacy fields (כמו שהיה אצלך)
      title: best.title,
      price: best.price,
      currency: best.currency,
      image: best.image,
      affiliate_link: best.affiliate_link,

      // new: top 6
      results,

      ...(debug ? { meta: { ...meta, geoCountry } } : {})
    });
  } catch (err) {
    console.error("search-affiliate failed:", err);
    return res.status(500).json({
      error: "search-affiliate crashed",
      message: err.message
    });
  }
}
