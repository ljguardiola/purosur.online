import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fetchOrderSuggestion } from "./order-suggestion-api";
import { ORDER_SUGGESTION } from "./test-support/order-suggestion";

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchOrderSuggestion", () => {
  test("reads each product to order with the offers of the suppliers", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, ORDER_SUGGESTION));

    expect(await fetchOrderSuggestion()).toEqual({ kind: "ok", value: ORDER_SUGGESTION });
    expect(fetch).toHaveBeenCalledWith("/api/order-suggestion");
  });

  test("returns failed when the suggestion does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { lines: [{ offers: 1 }] }));

    expect(await fetchOrderSuggestion()).toEqual({ kind: "failed" });
  });

  test.each([
    [401, { kind: "unauthenticated" }],
    [403, { kind: "forbidden" }],
    [500, { kind: "failed" }],
  ] as const)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchOrderSuggestion()).toEqual(outcome);
  });
});
