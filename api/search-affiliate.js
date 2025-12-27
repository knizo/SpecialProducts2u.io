import crypto from "crypto";

function sign(params, secret) {
  const sortedKeys = Object.keys(params).sort();
  const baseString = sortedKeys.map(k => `${k}${params[k]}`).join("");
  return crypto
    .createHash("md5")
    .update(secret + baseString + secret)
    .digest("hex")
    .toUpperCase();
}

async function aliRequest(params) {
  const query = new URLSearchParams(params).toString();
  const url = `https://api-sg.aliexpress.com/sync?${query}`;
  const res = await fetch(url);
  return res.json();
}

export default async function handler(req, res) {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: "Missing search query" });

  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const secret = process.env.ALIEXPRESS_APP_SECRET;

  /* 1️⃣ חיפוש מוצר */
  const searchParams = {
    app_key: appKey,
    method: "aliexpress.affiliate.product.query",
    timestamp: Date.now(),
    format: "json",
    sign_method: "md5",
    keywords: q,
    page_no: 1,
    page_size: 1,
    target_currency: "USD",
    target_language: "EN"
  };
  searchParams.sign = sign(searchParams, secret);

  const search = await aliRequest(searchParams);
  const product =
    search?.aliexpress_affiliate_product_query_response
      ?.resp_result?.result?.products?.product?.[0];

  if (!product)
    return res.status(404).json({ error: "No products found" });

  /* 2️⃣ יצירת Affiliate link */
  const linkParams = {
    app_key: appKey,
    method: "aliexpress.affiliate.link.generate",
    timestamp: Date.now(),
    format: "json",
    sign_method: "md5",
    promotion_link_type: "2",
    source_values: product.product_detail_url
  };
  linkParams.sign = sign(linkParams, secret);

  const link = await aliRequest(linkParams);
  const promo =
    link?.aliexpress_affiliate_link_generate_response
      ?.resp_result?.result?.promotion_links?.promotion_link?.[0];

  if (!promo)
    return res.status(500).json({ error: "Affiliate link failed" });

  /* 3️⃣ החזרה נקייה ל-Frontend */
  res.json({
    title: product.product_title,
    price: product.target_sale_price + " USD",
    image: product.product_main_image_url,
    affiliate_link: promo.promotion_link
  });
}
