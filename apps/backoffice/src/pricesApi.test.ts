import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { confirmPrice, fetchPrices, type PriceProduct, setPrice } from "./pricesApi";

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

const arroz: PriceProduct = {
  id: "product-1",
  name: "Arroz",
  categoryId: "category-1",
  categoryName: "Almacén",
  saleUnit: "KG",
  currentPrice: { id: "price-1", unitPrice: 750000, validFrom: "2026-01-01T12:00:00.000Z" },
  lastReviewedAt: "2026-01-01T12:00:00.000Z",
  pending: true,
};

test("fetchPrices lists the products, the pending count, the review window and the categories on 200", async () => {
  const categories = [{ id: "category-1", name: "Almacén" }];
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories }),
  );

  const outcome = await fetchPrices({ review: "pending" });

  expect(outcome).toEqual({
    kind: "ok",
    value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories },
  });
  expect(fetch).toHaveBeenCalledWith("/prices?review=pending");
});

test("fetchPrices sends categoryId and search alongside review", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { products: [], pendingCount: 0, reviewWindowDays: 30, categories: [] }),
  );

  await fetchPrices({ review: "all", categoryId: "category-1", search: "arroz" });

  expect(fetch).toHaveBeenCalledWith("/prices?review=all&categoryId=category-1&search=arroz");
});

test("fetchPrices returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await fetchPrices({ review: "pending" })).toEqual({ kind: "unauthenticated" });
});

test("fetchPrices returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await fetchPrices({ review: "pending" })).toEqual({ kind: "forbidden" });
});

test("fetchPrices returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "60" }));

  expect(await fetchPrices({ review: "pending" })).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
});

test("fetchPrices returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await fetchPrices({ review: "pending" })).toEqual({ kind: "failed" });
});

test("fetchPrices returns failed on a body without its categories", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { products: [arroz], pendingCount: 1, reviewWindowDays: 30 }),
  );

  expect(await fetchPrices({ review: "pending" })).toEqual({ kind: "failed" });
});

test("fetchPrices returns failed on a malformed body", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { products: "not an array" }));

  expect(await fetchPrices({ review: "pending" })).toEqual({ kind: "failed" });
});

test("setPrice posts the unit price and expected current price id, returning the new price on 200", async () => {
  const newPrice = { id: "price-2", unitPrice: 800000, validFrom: "2026-02-01T12:00:00.000Z" };
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { price: newPrice, lastReviewedAt: "2026-02-01T12:00:00.000Z" }),
  );

  const outcome = await setPrice("product-1", {
    unitPrice: 800000,
    expectedCurrentPriceId: "price-1",
  });

  expect(outcome).toEqual({
    kind: "ok",
    value: { price: newPrice, lastReviewedAt: "2026-02-01T12:00:00.000Z" },
  });
  expect(fetch).toHaveBeenCalledWith("/products/product-1/price", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ unitPrice: 800000, expectedCurrentPriceId: "price-1" }),
  });
});

test("setPrice sends a null expectedCurrentPriceId for a product with no price yet", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, {
      price: { id: "price-1", unitPrice: 500, validFrom: "2026-01-01T00:00:00.000Z" },
      lastReviewedAt: "2026-01-01T00:00:00.000Z",
    }),
  );

  await setPrice("product-1", { unitPrice: 500, expectedCurrentPriceId: null });

  expect(fetch).toHaveBeenCalledWith("/products/product-1/price", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ unitPrice: 500, expectedCurrentPriceId: null }),
  });
});

test("setPrice returns validation_failed on the named field for a 400", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, {
      code: "validation_failed",
      message: "unitPrice must be a positive integer number of cents",
      details: [{ field: "unitPrice" }],
    }),
  );

  expect(await setPrice("product-1", { unitPrice: -1, expectedCurrentPriceId: null })).toEqual({
    kind: "validation_failed",
    field: "unitPrice",
  });
});

test("setPrice returns price_unchanged on a 400 with that code", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "price_unchanged", details: [{ field: "unitPrice" }] }),
  );

  expect(
    await setPrice("product-1", { unitPrice: 500, expectedCurrentPriceId: "price-1" }),
  ).toEqual({ kind: "price_unchanged" });
});

test("setPrice returns not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404));

  expect(await setPrice("missing", { unitPrice: 500, expectedCurrentPriceId: null })).toEqual({
    kind: "not_found",
  });
});

test("setPrice returns stale_price on 409", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "stale_price" }));

  expect(
    await setPrice("product-1", { unitPrice: 500, expectedCurrentPriceId: "price-1" }),
  ).toEqual({ kind: "stale_price" });
});

test("setPrice returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await setPrice("product-1", { unitPrice: 500, expectedCurrentPriceId: null })).toEqual({
    kind: "unauthenticated",
  });
});

test("setPrice returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await setPrice("product-1", { unitPrice: 500, expectedCurrentPriceId: null })).toEqual({
    kind: "forbidden",
  });
});

test("setPrice returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

  expect(await setPrice("product-1", { unitPrice: 500, expectedCurrentPriceId: null })).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 30,
  });
});

test("setPrice returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await setPrice("product-1", { unitPrice: 500, expectedCurrentPriceId: null })).toEqual({
    kind: "failed",
  });
});

test("confirmPrice posts the expected current price id, returning the review moment on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { lastReviewedAt: "2026-02-01T12:00:00.000Z" }),
  );

  const outcome = await confirmPrice("product-1", { expectedCurrentPriceId: "price-1" });

  expect(outcome).toEqual({ kind: "ok", value: { lastReviewedAt: "2026-02-01T12:00:00.000Z" } });
  expect(fetch).toHaveBeenCalledWith("/products/product-1/price-confirmation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expectedCurrentPriceId: "price-1" }),
  });
});

test("confirmPrice returns no_price_to_confirm on a 400 with that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "no_price_to_confirm" }));

  expect(await confirmPrice("product-1", { expectedCurrentPriceId: "price-1" })).toEqual({
    kind: "no_price_to_confirm",
  });
});

test("confirmPrice returns validation_failed on a 400 with that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "validation_failed" }));

  expect(await confirmPrice("product-1", { expectedCurrentPriceId: "price-1" })).toEqual({
    kind: "validation_failed",
  });
});

test("confirmPrice returns not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404));

  expect(await confirmPrice("missing", { expectedCurrentPriceId: "price-1" })).toEqual({
    kind: "not_found",
  });
});

test("confirmPrice returns stale_price on 409", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "stale_price" }));

  expect(await confirmPrice("product-1", { expectedCurrentPriceId: "price-1" })).toEqual({
    kind: "stale_price",
  });
});

test("confirmPrice returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await confirmPrice("product-1", { expectedCurrentPriceId: "price-1" })).toEqual({
    kind: "unauthenticated",
  });
});

test("confirmPrice returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await confirmPrice("product-1", { expectedCurrentPriceId: "price-1" })).toEqual({
    kind: "forbidden",
  });
});

test("confirmPrice returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "15" }));

  expect(await confirmPrice("product-1", { expectedCurrentPriceId: "price-1" })).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 15,
  });
});

test("confirmPrice returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await confirmPrice("product-1", { expectedCurrentPriceId: "price-1" })).toEqual({
    kind: "failed",
  });
});
