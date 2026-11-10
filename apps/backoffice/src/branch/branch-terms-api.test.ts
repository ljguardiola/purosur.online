import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchGoodConditionReturnDays, fetchSupplierPriceListDailyCap } from "./branch-terms-api";

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const reads = [
  {
    name: "fetchGoodConditionReturnDays",
    read: fetchGoodConditionReturnDays,
    path: "/api/locations/current/good-condition-return-days",
    body: { good_condition_return_days: 15 },
    wrongField: { supplier_price_list_daily_extraction_cap: 10 },
    value: 15,
  },
  {
    name: "fetchSupplierPriceListDailyCap",
    read: fetchSupplierPriceListDailyCap,
    path: "/api/locations/current/supplier-price-list-daily-cap",
    body: { supplier_price_list_daily_extraction_cap: 10 },
    wrongField: { good_condition_return_days: 15 },
    value: 10,
  },
];

test.each(reads)("$name returns the term on 200", async ({ read, path, body, value }) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  expect(await read()).toEqual({ kind: "ok", value });
  expect(fetch).toHaveBeenCalledWith(path);
});

test.each(reads)(
  "$name returns failed on 200 with another term's body",
  async ({ read, wrongField }) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, wrongField));

    expect(await read()).toEqual({ kind: "failed" });
  },
);

test.each(reads)("$name returns failed on 200 with a mistyped term", async ({ read, body }) => {
  const [field] = Object.keys(body);
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { [field as string]: "15" }));

  expect(await read()).toEqual({ kind: "failed" });
});

test.each(reads)("$name returns failed on 200 with a body that is not JSON", async ({ read }) => {
  vi.mocked(fetch).mockResolvedValue(new Response("<html>", { status: 200 }));

  expect(await read()).toEqual({ kind: "failed" });
});

test.each(reads)("$name returns unauthenticated on 401", async ({ read }) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await read()).toEqual({ kind: "unauthenticated" });
});

test.each(reads)("$name returns forbidden on 403", async ({ read }) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await read()).toEqual({ kind: "forbidden" });
});

test.each(reads)(
  "$name returns rate_limited with the Retry-After header on 429",
  async ({ read }) => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(null, { status: 429, headers: { "Retry-After": "45" } }),
    );

    expect(await read()).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
  },
);

test.each(reads)("$name returns failed when the network call throws", async ({ read }) => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));

  expect(await read()).toEqual({ kind: "failed" });
});

test.each(reads)("$name returns failed on an unexpected status", async ({ read }) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));

  expect(await read()).toEqual({ kind: "failed" });
});
