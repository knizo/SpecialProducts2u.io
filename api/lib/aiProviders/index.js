// api/lib/aiProviders/index.js
//
// Central switchboard for AI providers. Every provider must expose the
// same shape: { refineQuery(rawQuery) => Promise<spec|null> }.
//
// To add a new provider later (e.g. Groq):
//   1. Create api/lib/aiProviders/groq.js with an exported refineQuery(rawQuery, opts)
//      that returns the SAME spec shape as gemini.js's normalizeSpec().
//   2. Register it below in PROVIDERS.
//   3. Set AI_PROVIDER=groq in your environment. No other code changes needed.

import * as gemini from "./gemini.js";
// import * as groq from "./groq.js"; // <-- uncomment when groq.js exists

const PROVIDERS = {
  gemini: {
    refineQuery: (rawQuery) =>
      gemini.refineQuery(rawQuery, {
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash"
      })
  }

  // groq: {
  //   refineQuery: (rawQuery) =>
  //     groq.refineQuery(rawQuery, {
  //       apiKey: process.env.GROQ_API_KEY,
  //       model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile"
  //     })
  // }
};

export function getAIProvider() {
  const name = (process.env.AI_PROVIDER || "gemini").toLowerCase();
  const provider = PROVIDERS[name];

  if (!provider) {
    console.warn(`Unknown AI_PROVIDER "${name}" — no AI refinement will run this request.`);
    return null;
  }

  return provider;
}
