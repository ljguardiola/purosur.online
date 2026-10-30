import { AI_MODEL_PRICES } from "@purosur/domain";
import type { AiCallUsage } from "@purosur/domain/purchasing/use-cases";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  type AnthropicFetch,
  anthropicClient,
  askForStructuredAnswer,
  PURCHASING_AI_MODEL,
} from "./anthropic-structured-call.js";
import {
  apiErrorResponse,
  streamAbortedAfterItsStartResponse,
  streamedAnswerResponse,
  streamedJsonResponse,
  streamInterruptedByErrorResponse,
} from "./test-support/anthropic-stream-fixtures.js";

interface RecordedRequest {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

const FORMAT = z.object({ answer: z.string() });

function clientAnswering(respond: () => Response | Promise<Response>) {
  const requests: RecordedRequest[] = [];
  const fetch: AnthropicFetch = async (input, init) => {
    requests.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });
    return respond();
  };
  const client = anthropicClient({
    apiKey: "fictional-api-key-for-tests",
    fetch,
    timeoutMs: 5_000,
  });
  return { client, requests };
}

function ask(
  client: ReturnType<typeof anthropicClient>,
  signal?: AbortSignal,
  onCall: (usage: AiCallUsage) => void = () => {},
) {
  return askForStructuredAnswer(client, {
    systemPrompt: "Answer with the format given.",
    content: [{ type: "text", text: "Yerba 1 kg" }],
    format: FORMAT,
    maxTokens: 512,
    effort: "low",
    onCall,
    ...(signal ? { signal } : {}),
  });
}

async function callsReportedBy(
  respond: () => Response | Promise<Response>,
  signal?: AbortSignal,
): Promise<AiCallUsage[]> {
  const { client } = clientAnswering(respond);
  const calls: AiCallUsage[] = [];
  await ask(client, signal, (usage) => calls.push(usage));
  return calls;
}

function attempt(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheWriteTokens = 0,
  cacheReadTokens = 0,
) {
  return { model, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens };
}

describe("the request it sends", () => {
  it("streams one message to the purchasing model with the key, limits, effort and format", async () => {
    const { client, requests } = clientAnswering(() => streamedJsonResponse({ answer: "sí" }));

    await ask(client);

    expect(requests).toHaveLength(1);
    const [request] = requests as [RecordedRequest];
    expect(new URL(request.url).pathname).toBe("/v1/messages");
    expect(request.headers.get("x-api-key")).toBe("fictional-api-key-for-tests");
    expect(request.body).toMatchObject({
      model: PURCHASING_AI_MODEL,
      max_tokens: 512,
      stream: true,
      output_config: { effort: "low", format: { type: "json_schema" } },
      messages: [{ role: "user", content: [{ type: "text", text: "Yerba 1 kg" }] }],
    });
  });

  it("sends the instructions as a cached system prompt", async () => {
    const { client, requests } = clientAnswering(() => streamedJsonResponse({ answer: "sí" }));

    await ask(client);

    expect(requests[0]?.body["system"]).toEqual([
      {
        type: "text",
        text: "Answer with the format given.",
        cache_control: { type: "ephemeral" },
      },
    ]);
  });

  it("does not retry a refused request by itself", async () => {
    const { client, requests } = clientAnswering(() => apiErrorResponse(529, "overloaded_error"));

    await ask(client);

    expect(requests).toHaveLength(1);
  });
});

describe("the answer it gives", () => {
  it("answers the text the model wrote", async () => {
    const { client } = clientAnswering(() => streamedJsonResponse({ answer: "sí" }));

    expect(await ask(client)).toEqual({ kind: "answered", text: '{"answer":"sí"}' });
  });

  it("puts together a text that arrives in pieces", async () => {
    const { client } = clientAnswering(() =>
      streamedAnswerResponse({ textParts: ['{"answer"', ':"sí"}'] }),
    );

    expect(await ask(client)).toEqual({ kind: "answered", text: '{"answer":"sí"}' });
  });

  it("answers too_long for an answer cut at the token limit", async () => {
    const { client } = clientAnswering(() =>
      streamedAnswerResponse({ textParts: ["{"], stopReason: "max_tokens" }),
    );

    expect(await ask(client)).toEqual({ kind: "too_long" });
  });

  it.each([
    [
      "an answer the model refused",
      streamedAnswerResponse({ textParts: ["{}"], stopReason: "refusal" }),
    ],
    ["an answer without text", streamedAnswerResponse({ textParts: [], withTextBlock: false })],
    ["a request refused as invalid", apiErrorResponse(400, "invalid_request_error")],
    ["a request refused as too large", apiErrorResponse(413, "request_too_large")],
  ])("answers unreadable for %s", async (_name, response) => {
    const { client } = clientAnswering(() => response);

    expect(await ask(client)).toEqual({ kind: "unreadable" });
  });

  it.each([
    [401, "authentication_error"],
    [403, "permission_error"],
    [429, "rate_limit_error"],
    [500, "api_error"],
    [529, "overloaded_error"],
  ])("answers unavailable for an HTTP %i", async (status, type) => {
    const { client } = clientAnswering(() => apiErrorResponse(status, type));

    expect(await ask(client)).toEqual({ kind: "unavailable" });
  });

  it("answers unavailable for a connection that fails", async () => {
    const { client } = clientAnswering(() => {
      throw new TypeError("fetch failed");
    });

    expect(await ask(client)).toEqual({ kind: "unavailable" });
  });

  it("answers unavailable for an error that interrupts the stream", async () => {
    const { client } = clientAnswering(streamInterruptedByErrorResponse);

    expect(await ask(client)).toEqual({ kind: "unavailable" });
  });

  it("answers unavailable when the caller gives up on the request", async () => {
    const controller = new AbortController();
    controller.abort();
    const { client } = clientAnswering(() => streamedJsonResponse({ answer: "sí" }));

    expect(await ask(client, controller.signal)).toEqual({ kind: "unavailable" });
  });
});

describe("the usage it reports", () => {
  it("reports one completed call with the tokens of the message", async () => {
    const calls = await callsReportedBy(() =>
      streamedAnswerResponse({
        textParts: ['{"answer":"sí"}'],
        usage: { inputTokens: 100, outputTokens: 30, cacheWriteTokens: 7, cacheReadTokens: 9 },
      }),
    );

    expect(calls).toEqual([
      { outcome: "completed", attempts: [attempt(PURCHASING_AI_MODEL, 100, 30, 7, 9)] },
    ]);
  });

  it("counts a token kind the provider did not report as none", async () => {
    const calls = await callsReportedBy(() => streamedJsonResponse({ answer: "sí" }));

    expect(calls).toEqual([
      { outcome: "completed", attempts: [attempt(PURCHASING_AI_MODEL, 25, 40, 0, 0)] },
    ]);
  });

  it("reports each attempt of the iterations under its own model, a fallback included", async () => {
    const calls = await callsReportedBy(() =>
      streamedAnswerResponse({
        textParts: ['{"answer":"sí"}'],
        usage: {
          inputTokens: 999,
          outputTokens: 999,
          iterations: [
            {
              type: "message",
              model: null,
              input_tokens: 100,
              output_tokens: 5,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
            {
              type: "fallback_message",
              model: "claude-sonnet-5",
              input_tokens: 100,
              output_tokens: 30,
              cache_creation_input_tokens: 4,
              cache_read_input_tokens: 6,
            },
          ],
        },
      }),
    );

    expect(calls).toEqual([
      {
        outcome: "completed",
        attempts: [attempt(PURCHASING_AI_MODEL, 100, 5), attempt("claude-sonnet-5", 100, 30, 4, 6)],
      },
    ]);
  });

  it("reports an answer cut at the token limit as cut short", async () => {
    const calls = await callsReportedBy(() =>
      streamedAnswerResponse({ textParts: ["{"], stopReason: "max_tokens" }),
    );

    expect(calls).toEqual([
      { outcome: "cut_short", attempts: [attempt(PURCHASING_AI_MODEL, 25, 40)] },
    ]);
  });

  it("reports an answer the model refused as cut short", async () => {
    const calls = await callsReportedBy(() =>
      streamedAnswerResponse({ textParts: ["{}"], stopReason: "refusal" }),
    );

    expect(calls.map(({ outcome }) => outcome)).toEqual(["cut_short"]);
  });

  it("reports an error that interrupts the stream as cut short with the tokens the stream started with", async () => {
    const calls = await callsReportedBy(streamInterruptedByErrorResponse);

    expect(calls).toEqual([
      { outcome: "cut_short", attempts: [attempt(PURCHASING_AI_MODEL, 25, 1)] },
    ]);
  });

  it("reports a call the caller aborted mid-stream as cut short with the tokens so far", async () => {
    const controller = new AbortController();
    const calls = await callsReportedBy(
      () => streamAbortedAfterItsStartResponse(controller.signal, () => controller.abort()),
      controller.signal,
    );

    expect(calls).toEqual([
      { outcome: "cut_short", attempts: [attempt(PURCHASING_AI_MODEL, 25, 1)] },
    ]);
  });

  it.each([
    [
      "a request refused before the model started",
      () => apiErrorResponse(400, "invalid_request_error"),
    ],
    ["a service that is overloaded", () => apiErrorResponse(529, "overloaded_error")],
  ])("reports %s as failed with no attempt", async (_name, response) => {
    const calls = await callsReportedBy(response);

    expect(calls).toEqual([{ outcome: "failed", attempts: [] }]);
  });

  it("reports a request aborted before anything started as failed with no attempt", async () => {
    const controller = new AbortController();
    controller.abort();

    const calls = await callsReportedBy(
      () => streamedJsonResponse({ answer: "sí" }),
      controller.signal,
    );

    expect(calls).toEqual([{ outcome: "failed", attempts: [] }]);
  });

  it("reports a connection that fails as failed with no attempt", async () => {
    const calls = await callsReportedBy(() => {
      throw new TypeError("fetch failed");
    });

    expect(calls).toEqual([{ outcome: "failed", attempts: [] }]);
  });
});

describe("the prices of the models it may use", () => {
  it.each([PURCHASING_AI_MODEL, "claude-sonnet-5"])(
    "has a price in effect now for the adapter's model and its known fallback, %s",
    (model) => {
      const price = AI_MODEL_PRICES.find(
        (entry) => entry.model === model && entry.appliesFrom <= new Date(),
      );

      expect(price).toBeDefined();
    },
  );
});
