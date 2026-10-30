import type { AiCallOutcome } from "../model/ai-call.js";
import type { AiAttemptUsage } from "../model/ai-model-prices.js";

// One call to the AI service as the provider reported it. A fallback to another model makes one
// attempt more; a call that failed before the provider reported anything has no attempt.
export interface AiCallUsage {
  outcome: AiCallOutcome;
  attempts: AiAttemptUsage[];
}

export type OnAiCall = (usage: AiCallUsage) => void;
