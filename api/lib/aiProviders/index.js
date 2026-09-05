// api/lib/aiProviders/index.js
//
// Central switchboard for AI providers. Every provider must expose the
// same shape: { refineQuery(rawQuery) => Promise<spec|null> }.
//
// To add a new provider later (e.g. OpenAI/ChatGPT):
//   1. Create api/lib/aiProviders/openai.js with an exported refineQuery(rawQuery, opts)
//      that returns the SAME spec shape (use shared.js's buildRefinePrompt/normalizeSpec).
//   2. Register it below in PROVIDERS.
//   3. Set AI_PROVIDER=openai in your environment. No other code changes needed.

import * as gemini from "./gemini.js";
import * as groq from "./groq.js";

const PROVIDERS = {
  groq: {
    refineQuery: (rawQuery) =>
      groq.refineQuery(rawQuery, {
        apiKey: process.env.GROQ_API_KEY,
        model: process.env.GROQ_MODEL || "openai/gpt-oss-20b"
      })
  },

  gemini: {
    refineQuery: (rawQuery) =>
      gemini.refineQuery(rawQuery, {
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || "gemini-3.6-flash"
      })
  }
};

// Groq is the default: it's free and the spec-extraction task here doesn't need
// a frontier model. Switch providers with AI_PROVIDER=<name> — no code change needed.
export function getAIProvider() {
  const name = (process.env.AI_PROVIDER || "groq").toLowerCase();
  const provider = PROVIDERS[name];

  if (!provider) {
    console.warn(`Unknown AI_PROVIDER "${name}" — no AI refinement will run this request.`);
    return null;
  }

  return provider;
}
