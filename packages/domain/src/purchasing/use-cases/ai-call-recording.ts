import { argentinaCalendarDay, type ZoneRulesSource } from "../../shared/index.js";
import type { AiCallOutcome, AiCallPurpose } from "../model/ai-call.js";
import { AI_MODEL_PRICES, aiAttemptCostNanoUsd } from "../model/ai-model-prices.js";
import type { AiCallUsage, OnAiCall } from "./ai-call-usage.js";

export interface AiCallRecord {
  purpose: AiCallPurpose;
  listId: string;
  rowId: string | null;
  actorId: string;
  occurredAt: Date;
  occurredOn: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outcome: AiCallOutcome;
  costNanoUsd: number | null;
}

export interface AiCallContext {
  purpose: AiCallPurpose;
  listId: string;
  rowId: string | null;
  actorId: string;
}

interface ReportedAiCall {
  usage: AiCallUsage;
  at: Date;
}

export interface AiCallCollector {
  onCall: OnAiCall;
  hasAttempts(): boolean;
  records(context: AiCallContext): AiCallRecord[];
}

export function collectAiCalls(now: () => Date, zoneRules: ZoneRulesSource): AiCallCollector {
  const reported: ReportedAiCall[] = [];
  return {
    onCall(usage) {
      reported.push({ usage, at: now() });
    },
    hasAttempts() {
      return reported.some(({ usage }) => usage.attempts.length > 0);
    },
    records(context) {
      return reported.flatMap(({ usage, at }) =>
        usage.attempts.map((attempt) => ({
          ...context,
          occurredAt: at,
          occurredOn: argentinaCalendarDay(at, zoneRules.zoneRules()),
          model: attempt.model,
          inputTokens: attempt.inputTokens,
          outputTokens: attempt.outputTokens,
          cacheWriteTokens: attempt.cacheWriteTokens,
          cacheReadTokens: attempt.cacheReadTokens,
          outcome: usage.outcome,
          costNanoUsd: aiAttemptCostNanoUsd(AI_MODEL_PRICES, attempt, at),
        })),
      );
    },
  };
}
