import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fetchSupplierPriceComparison } from "./supplier-price-comparison-api";
import { PRICE_COMPARISON } from "./test-support/supplier-price-comparison";

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchSupplierPriceComparison", () => {
  test("reads each product with the offers of the suppliers", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, PRICE_COMPARISON));

    expect(await fetchSupplierPriceComparison()).toEqual({ kind: "ok", value: PRICE_COMPARISON });
    expect(fetch).toHaveBeenCalledWith("/api/supplier-price-comparison");
  });

  test("returns failed when the comparison does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { products: [{ offers: 1 }] }));

    expect(await fetchSupplierPriceComparison()).toEqual({ kind: "failed" });
  });

  test.each([
    [401, { kind: "unauthenticated" }],
    [403, { kind: "forbidden" }],
    [500, { kind: "failed" }],
  ] as const)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchSupplierPriceComparison()).toEqual(outcome);
  });
});
