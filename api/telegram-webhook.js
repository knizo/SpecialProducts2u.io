// api/telegram-webhook.js
//
// Telegram bot webhook. Telegram POSTs every update here; we only act on messages that
// explicitly ask for a product (a /deal|/find command, or a configurable trigger word),
// run the same affiliate search the website uses, and reply with the tracked link.
//
// Serverless can't long-poll, so this is webhook-based. Register it once with:
//   https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook
//     ?url=https://<your-domain>/api/telegram-webhook
//     &secret_token=<TELEGRAM_WEBHOOK_SECRET>
//
// NOTE on groups: Telegram bots have "privacy mode" ON by default, meaning a bot in a
// group only receives messages that are commands (/deal ...), @-mention it, or reply to
// it. The /deal + /find commands therefore work with no extra setup. A bare trigger word
// (TELEGRAM_TRIGGER, e.g. "deal:") requires disabling privacy mode in BotFather:
//   /mybots -> your bot -> Bot Settings -> Group Privacy -> Turn off

import { searchAffiliate } from "./lib/affiliateSearch.js";

const TELEGRAM_API = "https://api.telegram.org";

// Commands work regardless of privacy mode; the keyword trigger needs privacy mode off.
const COMMANDS = ["/deal", "/find", "/ali"];
const MAX_QUERY_LEN = 300;

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Decide whether this message is asking us for a product, and if so what for.
 * Returns the search query string, or null to stay silent — staying silent is the
 * default for anything we don't clearly recognize, since this bot lives in a group
 * full of unrelated chatter and must not reply to all of it.
 */
function extractQuery(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;

  // /deal something   (Telegram appends @BotName in groups: "/deal@MyBot something")
  if (trimmed.startsWith("/")) {
    const [rawCommand, ...rest] = trimmed.split(/\s+/);
    const command = rawCommand.split("@")[0].toLowerCase();
    if (COMMANDS.includes(command)) {
      return rest.join(" ").trim() || null;
    }
    // Not one of ours — fall through rather than returning, so a custom
    // TELEGRAM_TRIGGER that happens to start with "/" still works.
  }

  // Configurable bare trigger, e.g. TELEGRAM_TRIGGER="deal:" -> "deal: wireless earbuds"
  const trigger = (process.env.TELEGRAM_TRIGGER || "").trim().toLowerCase();
  if (trigger && trimmed.toLowerCase().startsWith(trigger)) {
    return trimmed.slice(trigger.length).trim() || null;
  }

  return null;
}

async function sendMessage(chatId, text, replyToMessageId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("telegram-webhook: TELEGRAM_BOT_TOKEN is not set, cannot reply.");
    return;
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        reply_to_message_id: replyToMessageId,
        // Don't let a failed reply-to (deleted message) drop the whole reply.
        allow_sending_without_reply: true
      })
    });

    if (!res.ok) {
      console.error("telegram-webhook: sendMessage failed", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error("telegram-webhook: sendMessage error", err.message);
  }
}

function formatProduct(item) {
  const title = escapeHtml(item.title);
  const price = Number.isFinite(item.price) ? item.price.toFixed(2) : null;
  const currency = escapeHtml(item.currency || "USD");

  const lines = [`🛍 <b>${title}</b>`];
  if (price) lines.push(`💰 ${price} ${currency}`);
  // Raw URL on its own line so Telegram renders a link preview of the product.
  lines.push(item.affiliate_link);

  return lines.join("\n\n");
}

export default async function handler(req, res) {
  // Telegram only ever POSTs. Anything else is someone poking the endpoint.
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // This URL is public, so verify the shared secret Telegram echoes back on every
  // request (set via setWebhook's secret_token). Without this anyone who guesses the
  // URL could make the bot post affiliate links into the group.
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const gotSecret = req.headers["x-telegram-bot-api-secret-token"];
    if (gotSecret !== expectedSecret) {
      console.warn("telegram-webhook: rejected request with bad secret token");
      return res.status(401).json({ error: "Unauthorized" });
    }
  } else {
    console.warn(
      "telegram-webhook: TELEGRAM_WEBHOOK_SECRET is not set — this endpoint is unauthenticated."
    );
  }

  // From here on always answer 200: a non-2xx (or a timeout) makes Telegram retry the
  // same update, which would post duplicate replies into the group.
  try {
    // Vercel's Node runtime parses JSON bodies automatically, but fall back to parsing
    // it ourselves rather than silently ignoring every update if that ever isn't the case.
    let update = req.body || {};
    if (typeof update === "string") {
      try {
        update = JSON.parse(update);
      } catch {
        console.error("telegram-webhook: could not parse request body as JSON");
        return res.status(200).json({ ok: true, ignored: "unparseable body" });
      }
    }

    const message = update.message || update.channel_post;

    // Ignore edits, joins, photos without captions, and messages from other bots.
    if (!message || message.from?.is_bot) {
      return res.status(200).json({ ok: true, ignored: "not a user message" });
    }

    const text = message.text || message.caption || "";
    const query = extractQuery(text);

    if (!query) {
      // Normal case by far: ordinary group chatter we deliberately stay silent on.
      return res.status(200).json({ ok: true, ignored: "no trigger" });
    }

    const chatId = message.chat?.id;
    if (!chatId) {
      return res.status(200).json({ ok: true, ignored: "no chat id" });
    }

    if (query.length > MAX_QUERY_LEN) {
      await sendMessage(chatId, "❌ That search is too long — try a shorter product name.", message.message_id);
      return res.status(200).json({ ok: true });
    }

    console.log(`[telegram-webhook] chat=${chatId} query="${query}"`);

    const result = await searchAffiliate({
      query,
      // No visitor IP to geolocate here (the request comes from Telegram's servers, not
      // the person typing), so the group's target market is configured explicitly.
      shipTo: (process.env.TELEGRAM_SHIP_TO || "US").toUpperCase()
    });

    if (!result.ok && result.reason === "missing_env") {
      console.error("telegram-webhook: AliExpress env vars missing", result.have);
      await sendMessage(chatId, "⚠️ Search is not configured correctly right now.", message.message_id);
      return res.status(200).json({ ok: true });
    }

    if (!result.ok) {
      await sendMessage(
        chatId,
        `🔍 No matching product found for:\n<b>${escapeHtml(query)}</b>`,
        message.message_id
      );
      return res.status(200).json({ ok: true });
    }

    // Deliberately results[0] (strictly top-ranked) rather than result.best, which is
    // randomized among the top few for variety on the website. In the group the point
    // is to answer with the item actually asked for, so accuracy beats variety.
    const item = result.results[0];
    await sendMessage(chatId, formatProduct(item), message.message_id);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("telegram-webhook crashed:", err);
    // Still 200 — see note above about Telegram retrying.
    return res.status(200).json({ ok: true, error: err.message });
  }
}
