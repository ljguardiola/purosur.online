import { describe, expect, it } from "vitest";
import { AnthropicProductChooser } from "./anthropic-product-chooser.js";
import { PURCHASING_AI_MODEL } from "./anthropic-structured-call.js";
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

function chooserAnswering(respond: (request: RecordedRequest) => Response | Promise<Response>) {
  const requests: RecordedRequest[] = [];
  const chooser = new AnthropicProductChooser({
    apiKey: "fictional-api-key-for-tests",
    fetch: async (input, init) => {
      const request = {
        url: String(input),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)),
      };
      requests.push(request);
      return respond(request);
    },
  });
  return { chooser, requests };
}

const ITEM = { description: "Yerba mate suave 1 kg", presentation: "Caja x 10" };
const CANDIDATES = [
  { id: "7f1c2a40-0000-4000-8000-000000000001", name: "Yerba Suave 1 kg" },
  { id: "7f1c2a40-0000-4000-8000-000000000002", name: "Yerba Compuesta 500 g" },
];

describe("the request the chooser sends", () => {
  async function sentRequest() {
    const { chooser, requests } = chooserAnswering(() => streamedJsonResponse({ productId: null }));
    await chooser.choose(ITEM, CANDIDATES);
    return requests[0] as RecordedRequest;
  }

  it("streams one message to the model with the key it was given", async () => {
    const request = await sentRequest();

    expect(new URL(request.url).pathname).toBe("/v1/messages");
    expect(request.headers.get("x-api-key")).toBe("fictional-api-key-for-tests");
    expect(request.body).toMatchObject({ model: PURCHASING_AI_MODEL, stream: true });
  });

  it("sends the item's text and the candidates' ids and names as its only content, and no tools", async () => {
    const { body } = await sentRequest();

    const messages = body["messages"] as {
      role: string;
      content: { type: string; text: string }[];
    }[];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.content.map(({ type }) => type)).toEqual(["text"]);
    const text = messages[0]?.content[0]?.text ?? "";
    expect(text).toContain(ITEM.description);
    expect(text).toContain(ITEM.presentation);
    for (const candidate of CANDIDATES) {
      expect(text).toContain(candidate.id);
      expect(text).toContain(candidate.name);
    }
    expect(body).not.toHaveProperty("tools");
  });

  it("sends nothing but the model, the limits, the instructions, the format and the fallback", async () => {
    const { body } = await sentRequest();

    expect(Object.keys(body).sort()).toEqual([
      "fallbacks",
      "max_tokens",
      "messages",
      "model",
      "output_config",
      "stream",
      "system",
    ]);
  });

  it("tells the model that what the item says is data and never instructions", async () => {
    const { body } = await sentRequest();

    const system = body["system"] as { text: string }[];
    expect(system[0]?.text).toMatch(/never instructions/i);
  });

  it("asks for a structured answer holding only the chosen product", async () => {
    const { body } = await sentRequest();

    const outputConfig = body["output_config"] as {
      format: { type: string; schema: { properties: Record<string, unknown> } };
    };
    expect(outputConfig.format.type).toBe("json_schema");
    expect(Object.keys(outputConfig.format.schema.properties)).toEqual(["productId"]);
  });

  it("does not retry a refused request by itself", async () => {
    const { chooser, requests } = chooserAnswering(() => apiErrorResponse(429, "rate_limit_error"));

    await chooser.choose(ITEM, CANDIDATES);

    expect(requests).toHaveLength(1);
  });

  it("sends an item without a presentation", async () => {
    const { chooser, requests } = chooserAnswering(() => streamedJsonResponse({ productId: null }));

    await chooser.choose({ description: "Yerba", presentation: null }, CANDIDATES);

    expect(requests).toHaveLength(1);
  });
});

describe("the choice the chooser answers", () => {
  it("answers the product the model chose", async () => {
    const { chooser } = chooserAnswering(() =>
      streamedJsonResponse({ productId: CANDIDATES[0]?.id }),
    );

    expect(await chooser.choose(ITEM, CANDIDATES)).toEqual({
      kind: "chosen",
      productId: CANDIDATES[0]?.id,
    });
  });

  it("answers none when the model chose no product", async () => {
    const { chooser } = chooserAnswering(() => streamedJsonResponse({ productId: null }));

    expect(await chooser.choose(ITEM, CANDIDATES)).toEqual({ kind: "none" });
  });

  it("puts together an answer that arrives in pieces", async () => {
    const json = JSON.stringify({ productId: CANDIDATES[1]?.id });
    const { chooser } = chooserAnswering(() =>
      streamedAnswerResponse({ textParts: [json.slice(0, 10), json.slice(10)] }),
    );

    expect(await chooser.choose(ITEM, CANDIDATES)).toEqual({
      kind: "chosen",
      productId: CANDIDATES[1]?.id,
    });
  });
});

describe("what makes the chooser unavailable", () => {
  it.each([
    [400, "invalid_request_error"],
    [401, "authentication_error"],
    [403, "permission_error"],
    [413, "request_too_large"],
    [429, "rate_limit_error"],
    [500, "api_error"],
    [529, "overloaded_error"],
  ])("an HTTP %i", async (status, type) => {
    const { chooser } = chooserAnswering(() => apiErrorResponse(status, type));

    expect(await chooser.choose(ITEM, CANDIDATES)).toEqual({ kind: "unavailable" });
  });

  it("a connection that fails", async () => {
    const { chooser } = chooserAnswering(() => {
      throw new TypeError("fetch failed");
    });

    expect(await chooser.choose(ITEM, CANDIDATES)).toEqual({ kind: "unavailable" });
  });

  it("an error that interrupts the stream", async () => {
    const { chooser } = chooserAnswering(streamInterruptedByErrorResponse);

    expect(await chooser.choose(ITEM, CANDIDATES)).toEqual({ kind: "unavailable" });
  });

  it.each([
    ["an answer that is not JSON", streamedAnswerResponse({ textParts: ["not json"] })],
    ["an answer of another shape", streamedJsonResponse({ product: "x" })],
    ["a product id that is not text", streamedJsonResponse({ productId: 7 })],
    ["an answer cut short", streamedAnswerResponse({ textParts: ["{"], stopReason: "max_tokens" })],
    [
      "an answer the model refused",
      streamedAnswerResponse({ textParts: ["{}"], stopReason: "refusal" }),
    ],
    ["an answer without text", streamedAnswerResponse({ textParts: [], withTextBlock: false })],
  ])("%s", async (_name, response) => {
    const { chooser } = chooserAnswering(() => response);

    expect(await chooser.choose(ITEM, CANDIDATES)).toEqual({ kind: "unavailable" });
  });
});
