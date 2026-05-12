import type { AIProviderConfig } from "@/lib/ai-client";
import type { WorkflowAiModule } from "./types";

function fromEnv(): AIProviderConfig {
  return {
    baseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",
    apiKey: process.env.AI_API_KEY || "",
    model: process.env.AI_MODEL || "gpt-4o-mini",
  };
}

function localOpenAICompatible(c: AIProviderConfig): boolean {
  return /127\.0\.0\.1|localhost/i.test(c.baseUrl);
}

export const envWorkflowAiModule: WorkflowAiModule = {
  id: "env",
  getChatProvider: fromEnv,
  isChatConfigured() {
    const c = fromEnv();
    if (c.apiKey.trim().length > 0) return true;
    return localOpenAICompatible(c);
  },
  canRefineImagePrompt: true,
};
