import type { AiCallUsage } from "@purosur/domain/purchasing/use-cases";
import { describe, expect, it } from "vitest";
import { PURCHASING_AI_MODEL } from "./anthropic-structured-call.js";
import { AnthropicSupplierItemQuantityReader } from "./anthropic-supplier-item-quantity-reader.js";
import { SUPPLIER_ITEM_QUANTITY_RULE } from "./supplier-item-quantity-prompt.js";
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

function readerAnswering(respond: (request: RecordedRequest) => Response | Promise<Response>) {
  const requests: RecordedRequest[] = [];
  const reader = new AnthropicSupplierItemQuantityReader({
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
  return { reader, requests };
}

const ITEM = {
  description: "Aceite de palta extravirgen 250 ml - Ganofi",
  presentation: "x3 packs",
  otherPresentations: ["Pack x12u"],
};
const PRODUCT = {
  saleUnit: "UNIT" as const,
  netContent: { quantity: 250, unit: "ML" as const },
};

describe("the request the reader sends", () => {
  async function sentRequest() {
    const { reader, requests } = readerAnswering(() => streamedJsonResponse({ quantity: null }));
    await reader.read(ITEM, PRODUCT, () => {});
    return requests[0] as RecordedRequest;
  }

  it("streams one message to the model with the key it was given", async () => {
    const request = await sentRequest();

    expect(new URL(request.url).pathname).toBe("/v1/messages");
    expect(request.headers.get("x-api-key")).toBe("fictional-api-key-for-tests");
    expect(request.body).toMatchObject({ model: PURCHASING_AI_MODEL, stream: true });
  });

  it("sends the item's text and the product's sale unit and net content as its only content, and no tools", async () => {
    const { body } = await sentRequest();

    const messages = body["messages"] as {
      role: string;
      content: { type: string; text: string }[];
    }[];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.content.map(({ type }) => type)).toEqual(["text"]);
    expect(JSON.parse(messages[0]?.content[0]?.text ?? "")).toEqual({
      item: ITEM,
      product: PRODUCT,
    });
    expect(body).not.toHaveProperty("tools");
  });

  it("sends only the item's text and the product's sale unit and net content, whatever else it was given", async () => {
    const { reader, requests } = readerAnswering(() => streamedJsonResponse({ quantity: null }));

    const item = { ...ITEM, supplier: "Distribuidora" };
    const product = { ...PRODUCT, name: "Aceite de palta" };

    await reader.read(item, product, () => {});

    const messages = (requests[0] as RecordedRequest).body["messages"] as {
      content: { text: string }[];
    }[];
    expect(JSON.parse(messages[0]?.content[0]?.text ?? "")).toEqual({
      item: ITEM,
      product: PRODUCT,
    });
  });

  it("gives the model the rule for reading the quantity and tells it the item is data", async () => {
    const { body } = await sentRequest();

    const system = body["system"] as { text: string }[];
    expect(system[0]?.text).toContain(SUPPLIER_ITEM_QUANTITY_RULE);
    expect(system[0]?.text).toMatch(/never instructions/i);
  });

  it("asks for a structured answer holding only the quantity", async () => {
    const { body } = await sentRequest();

    const outputConfig = body["output_config"] as {
      format: { type: string; schema: { properties: Record<string, unknown> } };
    };
    expect(outputConfig.format.type).toBe("json_schema");
    expect(Object.keys(outputConfig.format.schema.properties)).toEqual(["quantity"]);
  });

  it("does not retry a refused request by itself", async () => {
    const { reader, requests } = readerAnswering(() => apiErrorResponse(429, "rate_limit_error"));

    await reader.read(ITEM, PRODUCT, () => {});

    expect(requests).toHaveLength(1);
  });
});

describe("the reading the reader answers", () => {
  it.each([
    [36, 36_000],
    [12.5, 12_500],
    [5, 5_000],
  ])(
    "answers the quantity %j of the sale unit as %j thousandths",
    async (quantity, thousandths) => {
      const { reader } = readerAnswering(() => streamedJsonResponse({ quantity }));

      expect(await reader.read(ITEM, PRODUCT, () => {})).toEqual({
        kind: "read",
        quantity: thousandths,
      });
    },
  );

  it("answers none when the model cannot tell the quantity", async () => {
    const { reader } = readerAnswering(() => streamedJsonResponse({ quantity: null }));

    expect(await reader.read(ITEM, PRODUCT, () => {})).toEqual({ kind: "none" });
  });

  it("puts together an answer that arrives in pieces", async () => {
    const json = JSON.stringify({ quantity: 36 });
    const { reader } = readerAnswering(() =>
      streamedAnswerResponse({ textParts: [json.slice(0, 5), json.slice(5)] }),
    );

    expect(await reader.read(ITEM, PRODUCT, () => {})).toEqual({ kind: "read", quantity: 36_000 });
  });
});

describe("what makes the reader unavailable", () => {
  it.each([
    [400, "invalid_request_error"],
    [401, "authentication_error"],
    [413, "request_too_large"],
    [429, "rate_limit_error"],
    [500, "api_error"],
    [529, "overloaded_error"],
  ])("an HTTP %i", async (status, type) => {
    const { reader } = readerAnswering(() => apiErrorResponse(status, type));

    expect(await reader.read(ITEM, PRODUCT, () => {})).toEqual({ kind: "unavailable" });
  });

  it("a connection that fails", async () => {
    const { reader } = readerAnswering(() => {
      throw new TypeError("fetch failed");
    });

    expect(await reader.read(ITEM, PRODUCT, () => {})).toEqual({ kind: "unavailable" });
  });

  it("an error that interrupts the stream", async () => {
    const { reader } = readerAnswering(streamInterruptedByErrorResponse);

    expect(await reader.read(ITEM, PRODUCT, () => {})).toEqual({ kind: "unavailable" });
  });

  it.each([
    ["an answer that is not JSON", streamedAnswerResponse({ textParts: ["not json"] })],
    ["an answer of another shape", streamedJsonResponse({ amount: 3 })],
    ["a quantity that is not a number", streamedJsonResponse({ quantity: "36" })],
    ["an answer cut short", streamedAnswerResponse({ textParts: ["{"], stopReason: "max_tokens" })],
    [
      "an answer the model refused",
      streamedAnswerResponse({ textParts: ["{}"], stopReason: "refusal" }),
    ],
    ["an answer without text", streamedAnswerResponse({ textParts: [], withTextBlock: false })],
  ])("%s", async (_name, response) => {
    const { reader } = readerAnswering(() => response);

    expect(await reader.read(ITEM, PRODUCT, () => {})).toEqual({ kind: "unavailable" });
  });
});

describe("the calls the reader reports", () => {
  it("reports the one call it made with the tokens the provider reported", async () => {
    const { reader } = readerAnswering(() =>
      streamedAnswerResponse({
        textParts: ['{"quantity":36}'],
        usage: { inputTokens: 80, outputTokens: 6, cacheReadTokens: 50 },
      }),
    );
    const calls: AiCallUsage[] = [];

    await reader.read(ITEM, PRODUCT, (usage) => calls.push(usage));

    expect(calls).toEqual([
      {
        outcome: "completed",
        attempts: [
          {
            model: PURCHASING_AI_MODEL,
            inputTokens: 80,
            outputTokens: 6,
            cacheWriteTokens: 0,
            cacheReadTokens: 50,
          },
        ],
      },
    ]);
  });

  it("reports a call that failed when the service is unavailable", async () => {
    const { reader } = readerAnswering(() => apiErrorResponse(529, "overloaded_error"));
    const calls: AiCallUsage[] = [];

    await reader.read(ITEM, PRODUCT, (usage) => calls.push(usage));

    expect(calls).toEqual([{ outcome: "failed", attempts: [] }]);
  });
});
