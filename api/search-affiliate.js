import md5 from "md5";
import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const query = req.query.q || "test";

    const appKey = process.env.ALI_APP_KEY;
    const secret = process.env.ALI_APP_SECRET;
    const trackingId = process.env.ALI_TRACKING_ID;

    if (!appKey || !secret || !trackingId) {
      return res.status(500).json({
        error: "Missing env vars",
        appKey: !!appKey,
        secret: !!secret,
        trackingId: !!trackingId
      });
    }

    function sign(params) {
      const sorted = Object.keys(params)
        .sort()
        .map(k => `${k}${params[k]}`)
        .join("");
      return md5(secret + sorted + secret).toUpperCase();
    }

    const params = {
      app_key: appKey,
      method: "aliexpress.affiliate.product.query",
      timestamp: Date.now(),
      format: "json",
      sign_method: "md5",
      keywords: query,
      tracking_id: trackingId,
      page_no: 1,
      page_size: 1,
      target_currency: "USD",
      target_language: "EN",
      ship_to_country: "US"
    };

    params.sign = sign(params);

    const url =
      "https://api-sg.aliexpress.com/sync?" +
      new URLSearchParams(params).toString();

    const response = await fetch(url);
    const data = await response.json();

    // 🔍 החזרה לבדיקה בלבד
    return res.json({
      ok: true,
      query,
      sample: data?.aliexpress_affiliate_product_query_response
        ?.resp_result?.result?.products?.product?.[0] || null
    });

  } catch (err) {
    console.error("Step 1 failed:", err);
    return res.status(500).json({
      error: "Step 1 crashed",
      message: err.message
    });
  }
}
