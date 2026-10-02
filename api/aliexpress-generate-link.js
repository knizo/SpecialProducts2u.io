import crypto from "crypto";

function sign(params, secret) {
  const sortedKeys = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null)
    .sort();

  const baseString = sortedKeys
    .map((key) => `${key}${params[key]}`)
    .join("");

  const stringToSign = `${secret}${baseString}${secret}`;

  return crypto
    .createHash("md5")
    .update(stringToSign)
    .digest("hex")
    .toUpperCase();
}

// Remove tracking/query parameters from the original AliExpress URL.
// Example:
// https://www.aliexpress.com/item/123.html?spm=xxx&search=y
// becomes:
// https://www.aliexpress.com/item/123.html
function sanitizeProductUrl(url) {
  try {
    const parsed = new URL(url);

    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  try {
    // Only allow GET
    if (req.method !== "GET") {
      return res.status(405).json({
        error: "Method not allowed"
      });
    }

    const { product_url } = req.query;

    if (!product_url) {
      return res.status(400).json({
        error: "Missing product_url"
      });
    }

    // Check API credentials
    const appKey = process.env.ALIEXPRESS_APP_KEY;
    const appSecret = process.env.ALIEXPRESS_APP_SECRET;
    const trackingId = process.env.ALIEXPRESS_TRACKING_ID;

    if (!appKey || !appSecret || !trackingId) {
      console.error("AliExpress API credentials are missing");

      return res.status(500).json({
        error: "AliExpress API credentials are not configured"
      });
    }

    // Clean the product URL before sending it to AliExpress
    const cleanProductUrl = sanitizeProductUrl(product_url);

    if (!cleanProductUrl) {
      return res.status(400).json({
        error: "Invalid product_url"
      });
    }

    /*
     * AliExpress API parameters
     */
    const params = {
      app_key: appKey,
      method: "aliexpress.affiliate.link.generate",

      // Keep timestamp as a string so the exact value used
      // for signing is also the value sent to AliExpress.
      timestamp: Date.now().toString(),

      format: "json",
      sign_method: "md5",
      v: "2.0",

      // 0 = normal affiliate promotion link
      promotion_link_type: "0",

      // Send the cleaned product URL
      source_values: cleanProductUrl,

      tracking_id: trackingId
    };

    /*
     * Generate AliExpress signature
     */
    params.sign = sign(params, appSecret);

    /*
     * Build API request
     */
    const query = new URLSearchParams(params).toString();

    const apiUrl = `https://api-sg.aliexpress.com/sync?${query}`;

    /*
     * Call AliExpress
     */
    const response = await fetch(apiUrl);

    if (!response.ok) {
      const errorText = await response.text();

      console.error("AliExpress HTTP error:", response.status, errorText);

      return res.status(502).json({
        error: "AliExpress API request failed",
        status: response.status
      });
    }

    const data = await response.json();

    /*
     * Extract the generated promotion link
     */
    const linkResult =
      data
        ?.aliexpress_affiliate_link_generate_response
        ?.resp_result
        ?.result
        ?.promotion_links
        ?.promotion_link?.[0];

    /*
     * Make sure AliExpress actually returned a link
     */
    if (!linkResult?.promotion_link) {
      console.error(
        "AliExpress did not return a promotion link:",
        JSON.stringify(data)
      );

      return res.status(502).json({
        error: "AliExpress did not return a promotion link"
      });
    }

    const shortLink = linkResult.promotion_link;

    /*
     * Return a clean response to your frontend.
     *
     * IMPORTANT:
     * The frontend should display/use `short_link`.
     */
    return res.status(200).json({
      success: true,
      short_link: shortLink,
      original_url: cleanProductUrl
    });

  } catch (err) {
    console.error("Affiliate link generation error:", err);

    return res.status(500).json({
      error: "Internal server error",
      message: err.message
    });
  }
}