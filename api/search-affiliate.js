import md5 from "md5";
import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ error: "Missing query" });
    }

    const appKey = process.env.ALI_APP_KEY;
    const secret = process.env.ALI_APP_SECRET;
    const trackingId = process.env.ALI_TRACKING_ID;

    if (!appKey || !secret || !trackingId) {
      return res.status(500).json({ error: "Missing AliExpress credentials" });
    }

    /* ---------- helpers ---------- */
    function sign(params, secret) {
      const sorted = Object.keys(params)
        .sort()
        .map((k) => `${k}${params[k]}`)
        .join("");
      return md5(secret + sorted + secret).toUpperCase();
    }

    async function aliRequest(params) {
      const url =
        "https://api-sg.aliexpress.com/sync?" +
        new URLSearchParams(params).toString();
      const r = await fetch(url);
      return await r.json();
    }

    /* ---------- 1️⃣ Search product ---------- */
    const searchParams = {
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
      ship_to_country: "US",
    };

    searchParams.sign = sign(searchParams, secret);
    const search = await aliRequest(searchParams);

    const product =
      search?.aliexpress_affiliate_product_query_response
        ?.resp_result?.result?.products?.product?.[0];

    if (!product || !product.product_detail_url) {
      return res.status(404).json({ error: "No product found" });
    }

    /* ---------- 2️⃣ Generate affiliate link ---------- */
    const cleanUrl = product.product_detail_url.split("?")[0];

    const linkParams = {
      app_key: appKey,
      method: "aliexpress.affiliate.link.generate",
      timestamp: Date.now(),
      format: "json",
      sign_method: "md5",
      promotion_link_type: "0",
      source_values: cleanUrl,
    };

    linkParams.sign = sign(linkParams, secret);
    const link = await aliRequest(linkParams);

    const affiliateLink =
      link?.aliexpress_affiliate_link_generate_response
        ?.resp_result?.result?.promotion_links?.promotion_link?.[0]
        ?.promotion_link;

    if (!affiliateLink) {
      return res.status(502).json({
        error: "Affiliate link failed",
        debug: link,
      });
    }

    /* ---------- 3️⃣ RETURN TO FRONTEND ---------- */
    return res.json({
      title: product.product_title,
      price: product.target_sale_price,
      image: product.product_main_image_url,
      affiliate_link: affiliateLink,
    });
  } catch (err) {
    console.error("search-affiliate crashed:", err);
    return res.status(500).json({
      error: "Server error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
