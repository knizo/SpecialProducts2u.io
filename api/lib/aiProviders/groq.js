// api/lib/aiProviders/groq.js
//
// Groq transport (OpenAI-compatible). Prompts and normalization live in shared.js.

import { completeJSONOpenAICompatible } from "./openaiCompatible.js";

export function completeJSON(prompt, { apiKey, model = "openai/gpt-oss-20b", timeoutMs } = {}) {
  return completeJSONOpenAICompatible({
    label: "Groq",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    prompt,
    apiKey,
    model,
    timeoutMs
  });
}
