import crypto from "crypto";
import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const query = req.query.q || "test";

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

    function sign(params) {
  const sorted = Object.keys(params)
    .sort()
    .map(k => `${k}${params[k]}`)
    .join("");

  return crypto
    .createHash("md5")
    .update(secret + sorted + secret)
    .digest("hex")
    .toUpperCase();
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
    const product =
  data?.aliexpress_affiliate_product_query_response
    ?.resp_result?.result?.products?.product?.[0];

if (!product) {
  return res.status(404).json({
    error: "No product found"
  });
}

    // 🔍 החזרה לבדיקה בלבד
   return res.json({
  title: product.product_title,
  price: parseFloat(product.target_sale_price),
  currency: product.target_sale_price_currency,
  image: product.product_main_image_url,
  affiliate_link: product.promotion_link
});

  } catch (err) {
    console.error("Step 1 failed:", err);
    return res.status(500).json({
      error: "Step 1 crashed",
      message: err.message
    });
  }
}
