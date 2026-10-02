// api/lib/aiProviders/index.js
//
// Central switchboard for AI providers. A provider only has to implement transport:
//   completeJSON(prompt, { apiKey, model, timeoutMs }) => Promise<object|null>
// Both AI tasks (refineQuery, verifyResults) are built on top of that here, from the
// prompts in shared.js, so adding a provider never means re-implementing either task.
//
// To add a new provider (e.g. OpenAI/ChatGPT):
//   1. Create api/lib/aiProviders/openai.js exporting completeJSON (for an
//      OpenAI-compatible API, wrap completeJSONOpenAICompatible like groq.js does).
//   2. Register it below in PROVIDERS with its env-var key/model.
//   3. Set AI_PROVIDER=openai in your environment. No other code changes needed.

import * as gemini from "./gemini.js";
import * as groq from "./groq.js";
import * as openrouter from "./openrouter.js";
import { buildRefinePrompt, normalizeSpec, buildVerifyPrompt, normalizeVerify } from "./shared.js";

const PROVIDERS = {
  groq: {
    completeJSON: (prompt, opts) =>
      groq.completeJSON(prompt, {
        apiKey: process.env.GROQ_API_KEY,
        model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
        ...opts
      })
  },

  gemini: {
    completeJSON: (prompt, opts) =>
      gemini.completeJSON(prompt, {
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
        ...opts
      })
  },

  openrouter: {
    completeJSON: (prompt, opts) =>
      openrouter.completeJSON(prompt, {
        apiKey: process.env.OPENROUTER_API_KEY,
        model: process.env.OPENROUTER_MODEL || "qwen/qwen3.8-27b:free",
        ...opts
      })
  }
};

// Groq is the default: it's free with a high daily limit, and neither task here needs a
// frontier model. Switch providers with AI_PROVIDER=<name> — no code change needed.
export function getAIProvider() {
  const name = (process.env.AI_PROVIDER || "groq").toLowerCase();
  const provider = PROVIDERS[name];

  if (!provider) {
    console.warn(`Unknown AI_PROVIDER "${name}" — no AI refinement will run this request.`);
    return null;
  }

  return {
    name,

    // Raw query -> structured search spec, or null if the AI call failed.
    async refineQuery(rawQuery) {
      const parsed = await provider.completeJSON(buildRefinePrompt(rawQuery));
      return parsed ? normalizeSpec(parsed, rawQuery) : null;
    },

    // Raw query + candidate titles -> 0-10 relevance score per title, or null if the
    // AI call failed (callers then keep their own ranking).
    async verifyResults(rawQuery, titles) {
      if (!titles.length) return null;
      const parsed = await provider.completeJSON(buildVerifyPrompt(rawQuery, titles));
      return parsed ? normalizeVerify(parsed, titles.length) : null;
    }
  };
}
