import type { AIProviderConfig } from "@/lib/ai-client";
import { workflowAiModule } from "./workflow-ai";

export function getChatProviderConfigured(): AIProviderConfig {
  if (!workflowAiModule.isChatConfigured()) {
    throw new Error(
      "Module IA non configuré : AI_API_KEY / AI_BASE_URL / AI_MODEL dans .env (dossier email-app), ou WORKFLOW_AI_MODULE=env."
    );
  }
  return workflowAiModule.getChatProvider();
}
