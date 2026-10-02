// api/lib/aiProviders/openrouter.js
//
// OpenRouter transport (OpenAI-compatible). Prompts and normalization live in shared.js.

import { completeJSONOpenAICompatible } from "./openaiCompatible.js";

export function completeJSON(prompt, { apiKey, model = "qwen/qwen3.8-27b:free", timeoutMs } = {}) {
  return completeJSONOpenAICompatible({
    label: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    // Optional attribution headers OpenRouter asks integrations to send; they have no
    // effect on the request itself.
    extraHeaders: {
      "HTTP-Referer": "https://store.knizo.com",
      "X-Title": "Special-Products"
    },
    prompt,
    apiKey,
    model,
    timeoutMs
  });
}
