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
  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const appSecret = process.env.ALIEXPRESS_APP_SECRET;

  if (!appKey || !appSecret) {
    return res.status(500).json({ error: "Missing API credentials" });
  }

  const params = {
    app_key: appKey,
    method: "aliexpress.affiliate.product.query",
    timestamp: Date.now(),
    format: "json",
    sign_method: "md5",
    keywords: "wireless earbuds",
    page_no: 1,
    page_size: 5,
    target_currency: "USD",
    target_language: "EN"
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
