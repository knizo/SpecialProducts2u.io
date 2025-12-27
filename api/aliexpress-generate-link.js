import crypto from "crypto";

function sign(params, secret) {
  const sortedKeys = Object.keys(params).sort();
  const baseString = sortedKeys
    .map(key => `${key}${params[key]}`)
    .join("");

  const stringToSign = secret + baseString + secret;

  return crypto
    .createHash("md5")
    .update(stringToSign)
    .digest("hex")
    .toUpperCase();
}

export default async function handler(req, res) {
  const { product_url } = req.query;

  if (!product_url) {
    return res.status(400).json({ error: "Missing product_url" });
  }

  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const appSecret = process.env.ALIEXPRESS_APP_SECRET;

  const params = {
    app_key: appKey,
    method: "aliexpress.affiliate.link.generate",
    timestamp: Date.now(),
    format: "json",
    sign_method: "md5",
    promotion_link_type: "2",
    source_values: product_url,
    tracking_id: "Electronics"
  };

  params.sign = sign(params, appSecret);

  const query = new URLSearchParams(params).toString();
  const url = `https://api-sg.aliexpress.com/sync?${query}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
