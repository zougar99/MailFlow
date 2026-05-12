import type { AIProviderConfig } from "@/lib/ai-client";

export type WorkflowAiModule = {
  id: string;
  getChatProvider: () => AIProviderConfig;
  isChatConfigured: () => boolean;
  canRefineImagePrompt: boolean;
};
