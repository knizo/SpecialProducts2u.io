/* 2️⃣ Create Affiliate link */
const cleanUrl = product.product_detail_url.split("?")[0];

const linkParams = {
  app_key: appKey,
  method: "aliexpress.affiliate.link.generate",
  timestamp: Date.now(),
  format: "json",
  sign_method: "md5",
  promotion_link_type: "2",
  source_values: cleanUrl,
};

linkParams.sign = sign(linkParams, secret);

const link = await aliRequest(linkParams);

const promoLinks =
  link?.aliexpress_affiliate_link_generate_response
    ?.resp_result?.result?.promotion_links;

let affiliateLink: string | undefined;

if (Array.isArray(promoLinks?.promotion_link)) {
  affiliateLink = promoLinks.promotion_link[0]?.promotion_link;
} else if (typeof promoLinks?.promotion_link === "object") {
  affiliateLink = promoLinks.promotion_link.promotion_link;
}

if (!affiliateLink) {
  return res.status(502).json({
    error: "Affiliate link failed",
    debug: link
  });
}

return res.json({
  title: product.product_title,
  price: product.target_sale_price,
  image: product.product_main_image_url,
  affiliate_link: affiliateLink
});
