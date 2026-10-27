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

function ask(client: ReturnType<typeof anthropicClient>, signal?: AbortSignal) {
  return askForStructuredAnswer(client, {
    systemPrompt: "Answer with the format given.",
    content: [{ type: "text", text: "Yerba 1 kg" }],
    format: FORMAT,
    maxTokens: 512,
    effort: "low",
    ...(signal ? { signal } : {}),
  });
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
