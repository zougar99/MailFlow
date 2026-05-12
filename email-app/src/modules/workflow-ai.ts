import type { WorkflowAiModule } from "./types";
import { envWorkflowAiModule } from "./builtin-env";
import { qwenGgufWorkflowAiModule } from "./qwen-gguf";

const mode = (process.env.WORKFLOW_AI_MODULE || "qwen-gguf").toLowerCase().trim();

export const workflowAiModule: WorkflowAiModule =
  mode === "env" ? envWorkflowAiModule : qwenGgufWorkflowAiModule;
