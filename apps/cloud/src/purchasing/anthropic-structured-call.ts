import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type {
  BetaContentBlockParam,
  BetaMessage,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { AiCallUsage, OnAiCall } from "@purosur/domain/purchasing/use-cases";
import type { z } from "zod";

export type PurchasingAiModel = "claude-sonnet-5-5" | "claude-haiku-5-5";

const OFFERS_SERVER_SIDE_FALLBACK: Record<PurchasingAiModel, boolean> = {
  "claude-sonnet-5-5": true,
  "claude-haiku-5-5": false,
};

export type AnthropicFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export function anthropicClient(options: {
  apiKey: string;
  fetch?: AnthropicFetch | undefined;
  timeoutMs: number;
}): Anthropic {
  return new Anthropic({
    apiKey: options.apiKey,
    fetch: options.fetch,
    maxRetries: 0,
    timeout: options.timeoutMs,
  });
}

export type StructuredAnswer =
  | { kind: "answered"; text: string }
  | { kind: "too_long" }
  | { kind: "invalid_answer" }
  | { kind: "unreadable" }
  | { kind: "unavailable" };

function refusesTheRequest(error: unknown): boolean {
  return (
    error instanceof Anthropic.BadRequestError ||
    (error instanceof Anthropic.APIError && error.status === 413)
  );
}

function attemptsOf(message: BetaMessage, requestedModel: PurchasingAiModel) {
  const { usage } = message;
  const sampled = (usage.iterations ?? []).flatMap((iteration) =>
    iteration.type === "message" || iteration.type === "fallback_message"
      ? [{ ...iteration, model: iteration.model ?? requestedModel }]
      : [],
  );
  const attempts =
    sampled.length > 0 ? sampled : [{ ...usage, model: message.model ?? requestedModel }];
  return attempts.map((attempt) => ({
    model: attempt.model,
    inputTokens: attempt.input_tokens,
    outputTokens: attempt.output_tokens,
    cacheWriteTokens: attempt.cache_creation_input_tokens ?? 0,
    cacheReadTokens: attempt.cache_read_input_tokens ?? 0,
  }));
}

function usageOf(
  message: BetaMessage | undefined,
  completed: boolean,
  requestedModel: PurchasingAiModel,
): AiCallUsage {
  if (message === undefined) {
    return { outcome: "failed", attempts: [] };
  }
  return {
    outcome: completed && message.stop_reason === "end_turn" ? "completed" : "cut_short",
    attempts: attemptsOf(message, requestedModel),
  };
}

export async function askForStructuredAnswer(
  client: Anthropic,
  request: {
    model: PurchasingAiModel;
    systemPrompt: string;
    content: BetaContentBlockParam[];
    format: z.ZodType;
    maxTokens: number;
    effort: "low" | "medium";
    signal?: AbortSignal;
    onCall: OnAiCall;
  },
): Promise<StructuredAnswer> {
  const outputFormat = betaZodOutputFormat(request.format);
  const stream = client.beta.messages.stream(
    {
      model: request.model,
      max_tokens: request.maxTokens,
      system: [{ type: "text", text: request.systemPrompt, cache_control: { type: "ephemeral" } }],
      ...(OFFERS_SERVER_SIDE_FALLBACK[request.model]
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
      output_config: {
        effort: request.effort,
        format: { type: outputFormat.type, schema: outputFormat.schema },
      },
      messages: [{ role: "user", content: request.content }],
    },
    request.signal ? { signal: request.signal } : {},
  );
  try {
    const message = await stream.finalMessage();
    request.onCall(usageOf(message, true, request.model));
    if (message.stop_reason === "max_tokens") {
      return { kind: "too_long" };
    }
    if (message.stop_reason === "refusal") {
      return { kind: "invalid_answer" };
    }
    if (message.stop_reason !== "end_turn") {
      return { kind: "unreadable" };
    }
    const answer = message.content.find((block) => block.type === "text");
    return answer ? { kind: "answered", text: answer.text } : { kind: "invalid_answer" };
  } catch (error) {
    request.onCall(usageOf(stream.currentMessage, false, request.model));
    if (refusesTheRequest(error)) {
      return { kind: "unreadable" };
    }
    if (error instanceof Anthropic.APIError) {
      return { kind: "unavailable" };
    }
    throw error;
  }
}
