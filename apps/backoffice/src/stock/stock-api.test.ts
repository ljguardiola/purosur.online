import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  discardExpiredLot,
  fetchExpectedBalance,
  fetchExpiringLots,
  fetchInitialInventoryLots,
  fetchStockBalances,
  fetchStockCounts,
  fetchStockMovementReasons,
  fetchStockMovements,
  fetchStockProducts,
  recordAdjustment,
  recordLoss,
  registerCount,
  setLotReferenceCost,
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
      active: true,
      balance: 12_150,
      valueCents: 12_400_100,
      unitCostCents: 1_020_584,
      lotCount: 1,
      correction: null,
      lots: [
        {
          id: "lot-1",
          lotNumber: "L-2312",
          expiresOn: "2026-10-14",
          technical: false,
          remaining: 12_150,
          valueCents: 12_400_100,
          unitCostCents: 1_020_584,
          origin: { kind: "purchase", purchasedOn: "2026-08-05", supplierName: "Distribuidora" },
        },
      ],
    },
  ],
  summary: { productCount: 1, valueCents: 12_400_100, withoutCostCount: 0 },
};

test("fetchStockBalances reads the balances list", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, balances));

  expect(await fetchStockBalances()).toEqual({ kind: "ok", value: balances });
  expect(fetch).toHaveBeenCalledWith("/api/inventory-levels");
});

test("fetchStockBalances treats a body without the summary as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { products: balances.products }));

  expect(await fetchStockBalances()).toEqual({ kind: "failed" });
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
  expect(fetch).toHaveBeenCalledWith("/api/inventory-counts?days=90");
});

test("fetchStockMovements asks for the period's days", async () => {
  const movements = { movements: [] };
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, movements));

  expect(await fetchStockMovements(7)).toEqual({ kind: "ok", value: movements });
  expect(fetch).toHaveBeenCalledWith("/api/inventory-movements?days=7");
});

test("fetchStockMovementReasons reads each reason with the directions it allows", async () => {
  const reasons = {
    reasons: [{ kind: "adjustment", reason: "supplier_return", directions: ["subtract"] }],
  };
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, reasons));

  expect(await fetchStockMovementReasons()).toEqual({ kind: "ok", value: reasons });
  expect(fetch).toHaveBeenCalledWith("/api/inventory-movement-reasons");
});

test("fetchExpectedBalance asks for the product's balance at the moment", async () => {
  const level = {
    id: PRODUCT_ID,
    name: "Almendras peladas",
    categoryId: "category-1",
    categoryName: "Frutos secos",
    saleUnit: "KG",
    active: true,
    balance: 17_000,
    lots: [
      {
        id: "00000000-0000-4000-8000-0000000000a1",
        lotNumber: "L-2312",
        expiresOn: "2026-10-14",
        expected: 4_400,
      },
    ],
  };
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, level));

  const outcome = await fetchExpectedBalance(PRODUCT_ID, "2026-09-15T21:32:00.000Z");

  expect(outcome).toEqual({ kind: "ok", value: level });
  expect(fetch).toHaveBeenCalledWith(
    `/api/inventory-levels/${PRODUCT_ID}?at=2026-09-15T21%3A32%3A00.000Z`,
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
  expect(fetch).toHaveBeenCalledWith("/api/inventory-losses", {
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
    "/api/inventory-adjustments",
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
  expect(fetch).toHaveBeenCalledWith(
    "/api/inventory-counts",
    expect.objectContaining({ method: "POST" }),
  );
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

test("fetchStockProducts reads the products a movement can be registered for", async () => {
  const products = { products: [{ ...balances.products[0], balance: undefined }] };
  const listed = {
    products: [
      {
        id: PRODUCT_ID,
        name: "Almendras peladas",
        categoryId: "category-1",
        categoryName: "Frutos secos",
        saleUnit: "KG",
        active: true,
      },
    ],
  };
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, products));

  expect(await fetchStockProducts()).toEqual({ kind: "ok", value: listed });
  expect(fetch).toHaveBeenCalledWith("/api/inventory-items");
});

const initialLots = {
  lots: [
    {
      lotId: "lot-1",
      productId: PRODUCT_ID,
      productName: "Almendras peladas",
      categoryName: "Frutos secos",
      saleUnit: "KG",
      expiresOn: "2026-12-01",
      counted: 4_400,
      withdrawn: false,
      remaining: 4_400,
      costIncomplete: false,
      unitCostCents: 1_018_000,
      valueCents: 4_479_200,
    },
  ],
};

test("fetchInitialInventoryLots reads every lot of the initial count when no filter is asked for", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, initialLots));

  expect(await fetchInitialInventoryLots({})).toEqual({ kind: "ok", value: initialLots });
  expect(fetch).toHaveBeenCalledWith("/api/initial-inventory-lots");
});

test.each(["known", "incomplete"] as const)(
  "fetchInitialInventoryLots asks only for the %s cost",
  async (cost) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { lots: [] }));

    await fetchInitialInventoryLots({ cost });

    expect(fetch).toHaveBeenCalledWith(`/api/initial-inventory-lots?cost=${cost}`);
  },
);

test("fetchInitialInventoryLots asks only for the lots of the searched product", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { lots: [] }));

  await fetchInitialInventoryLots({ cost: "incomplete", product: "té verde" });

  expect(fetch).toHaveBeenCalledWith(
    "/api/initial-inventory-lots?cost=incomplete&product=t%C3%A9+verde",
  );
});

test("fetchInitialInventoryLots treats a body that does not match the list as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { lots: [{ lotId: 1 }] }));

  expect(await fetchInitialInventoryLots({})).toEqual({ kind: "failed" });
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("fetchInitialInventoryLots answers %i as %j", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchInitialInventoryLots({})).toEqual(outcome);
});

test("fetchInitialInventoryLots answers failed when the request cannot be sent", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

  expect(await fetchInitialInventoryLots({})).toEqual({ kind: "failed" });
});

test("setLotReferenceCost puts the cost of the lot and answers ok on 204", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(204));

  expect(await setLotReferenceCost("lot-1", { unitCostCents: 1_018_000 })).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith("/api/initial-inventory-lots/lot-1/reference-cost", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ unitCostCents: 1_018_000 }),
  });
});

test.each([
  [404, { code: "not_found" }, { kind: "not_found" }],
  [404, { code: "lot_withdrawn" }, { kind: "lot_withdrawn" }],
  [409, { code: "not_an_initial_count_lot" }, { kind: "not_an_initial_count_lot" }],
  [
    400,
    { code: "validation_failed", details: [{ field: "unitCostCents" }] },
    { kind: "validation_failed", field: "unitCostCents" },
  ],
  [409, { code: "something_else" }, { kind: "failed" }],
  [500, undefined, { kind: "failed" }],
  [401, undefined, { kind: "unauthenticated" }],
  [403, undefined, { kind: "forbidden" }],
])("setLotReferenceCost answers %i %j as %j", async (status, body, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status, body));

  expect(await setLotReferenceCost("lot-1", { unitCostCents: 100 })).toEqual(outcome);
});

test("setLotReferenceCost reads the retry time of a rate-limited response", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "7" }));

  expect(await setLotReferenceCost("lot-1", { unitCostCents: 100 })).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 7,
  });
});

test("setLotReferenceCost answers failed when the request cannot be sent", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

  expect(await setLotReferenceCost("lot-1", { unitCostCents: 100 })).toEqual({ kind: "failed" });
});

const expiringLots = {
  windowDays: 30,
  lots: [
    {
      id: "lot-1",
      lotNumber: "L-SC02",
      expiresOn: "2026-10-10",
      remaining: 1_200,
      valueCents: 480_000,
      expired: true,
      daysToExpiry: -3,
      product: {
        id: PRODUCT_ID,
        name: "Semillas de chía",
        categoryId: "category-1",
        categoryName: "Semillas",
        saleUnit: "KG",
      },
    },
  ],
  summary: { valueCents: 480_000, withoutCostCount: 0 },
};

test("fetchExpiringLots reads the lots nearing expiry", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, expiringLots));

  expect(await fetchExpiringLots()).toEqual({ kind: "ok", value: expiringLots });
  expect(fetch).toHaveBeenCalledWith("/api/expiring-lots");
});

test.each([
  [jsonResponse(200, { windowDays: "30" }), { kind: "failed" }],
  [jsonResponse(401), { kind: "unauthenticated" }],
  [jsonResponse(403), { kind: "forbidden" }],
  [
    jsonResponse(429, undefined, { "Retry-After": "5" }),
    { kind: "rate_limited", retryAfterSeconds: 5 },
  ],
  [jsonResponse(404), { kind: "failed" }],
  [jsonResponse(502), { kind: "failed" }],
])("fetchExpiringLots answers a response as %#", async (response, outcome) => {
  vi.mocked(fetch).mockResolvedValue(response);

  expect(await fetchExpiringLots()).toEqual(outcome);
});

test("fetchExpiringLots answers failed when the request cannot be sent", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

  expect(await fetchExpiringLots()).toEqual({ kind: "failed" });
});

const discarded = { movementId: "movement-9", quantity: 1_200, balance: 0, superseded: false };

test("discardExpiredLot posts to the lot and reads what was discarded", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, discarded));

  expect(await discardExpiredLot("lot-1")).toEqual({ kind: "ok", value: discarded });
  expect(fetch).toHaveBeenCalledWith("/api/expiring-lots/lot-1/discard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
});

test.each([
  [jsonResponse(404, { code: "not_found" }), { kind: "not_found" }],
  [jsonResponse(409, { code: "lot_not_expired" }), { kind: "lot_not_expired" }],
  [jsonResponse(409, { code: "lot_empty" }), { kind: "lot_empty" }],
  [jsonResponse(409, { code: "something_else" }), { kind: "failed" }],
  [jsonResponse(401), { kind: "unauthenticated" }],
  [jsonResponse(403), { kind: "forbidden" }],
  [
    jsonResponse(429, undefined, { "Retry-After": "5" }),
    { kind: "rate_limited", retryAfterSeconds: 5 },
  ],
  [jsonResponse(200, { balance: "x" }), { kind: "failed" }],
  [jsonResponse(502), { kind: "failed" }],
])("discardExpiredLot answers a response as %#", async (response, outcome) => {
  vi.mocked(fetch).mockResolvedValue(response);

  expect(await discardExpiredLot("lot-1")).toEqual(outcome);
});

test("discardExpiredLot answers failed when the request cannot be sent", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

  expect(await discardExpiredLot("lot-1")).toEqual({ kind: "failed" });
});
