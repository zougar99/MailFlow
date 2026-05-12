import type { AIProviderConfig } from "@/lib/ai-client";
import type { WorkflowAiModule } from "./types";

function provider(): AIProviderConfig {
  return {
    baseUrl: (process.env.AI_BASE_URL || "http://127.0.0.1:11434/v1").replace(
      /\/$/,
      ""
    ),
    apiKey: process.env.AI_API_KEY || "ollama",
    model: process.env.AI_MODEL || "qwen3.5-27b",
  };
}

export const qwenGgufWorkflowAiModule: WorkflowAiModule = {
  id: "qwen-gguf",
  getChatProvider: provider,
  isChatConfigured() {
    const c = provider();
    if (c.apiKey.trim().length > 0) return true;
    return /127\.0\.0\.1|localhost/i.test(c.baseUrl);
  },
  canRefineImagePrompt: true,
};
