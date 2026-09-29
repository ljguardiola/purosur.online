import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  fetchExpectedBalance,
  fetchStockBalances,
  fetchStockCounts,
  fetchStockMovements,
  recordAdjustment,
  recordLoss,
  registerCount,
} from "./stock-api";

function jsonResponse(status: number, body?: unknown, headers?: Record<string, string>): Response {
  return new Response(
    body === undefined ? null : JSON.stringify(body),
    headers ? { status, headers } : { status },
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";

const balances = {
  products: [
    {
      id: PRODUCT_ID,
      name: "Almendras peladas",
      categoryId: "category-1",
      categoryName: "Frutos secos",
      saleUnit: "KG",
      balance: 12_150,
    },
  ],
};

test("fetchStockBalances reads the balances list", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, balances));

  expect(await fetchStockBalances()).toEqual({ kind: "ok", value: balances });
  expect(fetch).toHaveBeenCalledWith("/stock/balances");
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("fetchStockBalances answers %i as %j", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchStockBalances()).toEqual(outcome);
});

test("fetchStockBalances reads the retry time of a rate-limited response", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "12" }));

  expect(await fetchStockBalances()).toEqual({ kind: "rate_limited", retryAfterSeconds: 12 });
});

test("fetchStockBalances treats a body that does not match the list as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { products: [{ id: 1 }] }));

  expect(await fetchStockBalances()).toEqual({ kind: "failed" });
});

test("fetchStockBalances answers failed when the request cannot be sent", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

  expect(await fetchStockBalances()).toEqual({ kind: "failed" });
});

test("fetchStockCounts asks for the period's days", async () => {
  const counts = { counts: [] };
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, counts));

  expect(await fetchStockCounts(90)).toEqual({ kind: "ok", value: counts });
  expect(fetch).toHaveBeenCalledWith("/stock/counts?days=90");
});

test("fetchStockMovements asks for the period's days", async () => {
  const movements = { movements: [] };
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, movements));

  expect(await fetchStockMovements(7)).toEqual({ kind: "ok", value: movements });
  expect(fetch).toHaveBeenCalledWith("/stock/movements?days=7");
});

test("fetchExpectedBalance asks for the product's balance at the moment", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { expected: 17_000 }));

  const outcome = await fetchExpectedBalance(PRODUCT_ID, "2026-09-15T21:32:00.000Z");

  expect(outcome).toEqual({ kind: "ok", value: { expected: 17_000 } });
  expect(fetch).toHaveBeenCalledWith(
    `/stock/products/${PRODUCT_ID}/expected-balance?at=2026-09-15T21%3A32%3A00.000Z`,
  );
});

test("fetchExpectedBalance answers not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  expect(await fetchExpectedBalance(PRODUCT_ID, "2026-09-15T21:32:00.000Z")).toEqual({
    kind: "not_found",
  });
});

const lossBody = { productId: PRODUCT_ID, reason: "theft", quantity: 1000 } as const;

test("recordLoss posts the loss and reads its result", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { balance: 23_000, superseded: false }));

  expect(await recordLoss(lossBody)).toEqual({
    kind: "ok",
    value: { balance: 23_000, superseded: false },
  });
  expect(fetch).toHaveBeenCalledWith("/stock/losses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lossBody),
  });
});

test("recordAdjustment posts the adjustment", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { balance: 31_000, superseded: false }));
  const body = {
    productId: PRODUCT_ID,
    reason: "purchase_correction",
    direction: "add",
    quantity: 12_000,
  } as const;

  expect(await recordAdjustment(body)).toMatchObject({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith(
    "/stock/adjustments",
    expect.objectContaining({ body: JSON.stringify(body) }),
  );
});

test.each([
  [
    jsonResponse(400, { code: "validation_failed", details: [{ field: "quantity" }] }),
    { kind: "validation_failed", field: "quantity" },
  ],
  [jsonResponse(400, { code: "something_else" }), { kind: "failed" }],
  [jsonResponse(404, { code: "not_found" }), { kind: "not_found" }],
  [jsonResponse(401), { kind: "unauthenticated" }],
  [jsonResponse(403), { kind: "forbidden" }],
  [
    jsonResponse(429, undefined, { "Retry-After": "5" }),
    { kind: "rate_limited", retryAfterSeconds: 5 },
  ],
  [jsonResponse(200, { balance: "x" }), { kind: "failed" }],
  [jsonResponse(502), { kind: "failed" }],
])("recordLoss answers a response as %#", async (response, outcome) => {
  vi.mocked(fetch).mockResolvedValue(response);

  expect(await recordLoss(lossBody)).toEqual(outcome);
});

test("recordLoss answers failed when the request cannot be sent", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

  expect(await recordLoss(lossBody)).toEqual({ kind: "failed" });
});

const countBody = {
  productId: PRODUCT_ID,
  counted: 16_000,
  occurredAt: "2026-09-15T21:32:00.000Z",
};

test("registerCount posts the count and reads what it expected and changed", async () => {
  const result = { expected: 17_000, delta: -1000, balance: 16_000, superseded: false };
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, result));

  expect(await registerCount(countBody)).toEqual({ kind: "ok", value: result });
  expect(fetch).toHaveBeenCalledWith("/stock/counts", expect.objectContaining({ method: "POST" }));
});

test.each([
  [jsonResponse(400, { code: "occurred_in_the_future" }), { kind: "occurred_in_the_future" }],
  [jsonResponse(409, { code: "count_at_same_moment" }), { kind: "count_at_same_moment" }],
  [jsonResponse(409, {}), { kind: "failed" }],
  [
    jsonResponse(400, { code: "validation_failed", details: [{ field: "counted" }] }),
    { kind: "validation_failed", field: "counted" },
  ],
  [jsonResponse(404, { code: "not_found" }), { kind: "not_found" }],
])("registerCount answers a refusal as %#", async (response, outcome) => {
  vi.mocked(fetch).mockResolvedValue(response);

  expect(await registerCount(countBody)).toEqual(outcome);
});
