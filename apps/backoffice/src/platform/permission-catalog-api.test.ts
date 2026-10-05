import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchPermissionCatalog } from "./permission-catalog-api";

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

const catalog = [
  {
    area: "stock",
    permissions: [
      { key: "view_stock_balances", register_marker: "none", requires: [] },
      { key: "adjust_stock", register_marker: "none", requires: ["view_stock_balances"] },
    ],
  },
];

test("fetchPermissionCatalog returns the areas as the cloud answered them on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, catalog));

  const outcome = await fetchPermissionCatalog();

  expect(outcome).toEqual({ kind: "ok", value: catalog });
  expect(fetch).toHaveBeenCalledWith("/api/permission-catalog");
});

test("fetchPermissionCatalog returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await fetchPermissionCatalog()).toEqual({ kind: "unauthenticated" });
});

test("fetchPermissionCatalog returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await fetchPermissionCatalog()).toEqual({ kind: "forbidden" });
});

test("fetchPermissionCatalog returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "120" }));

  expect(await fetchPermissionCatalog()).toEqual({ kind: "rate_limited", retryAfterSeconds: 120 });
});

test("fetchPermissionCatalog returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await fetchPermissionCatalog()).toEqual({ kind: "failed" });
});

test("fetchPermissionCatalog returns failed on a server error", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));

  expect(await fetchPermissionCatalog()).toEqual({ kind: "failed" });
});

test("fetchPermissionCatalog returns failed on a 200 that is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("not json", { status: 200 }));

  expect(await fetchPermissionCatalog()).toEqual({ kind: "failed" });
});

test("fetchPermissionCatalog returns failed on a 200 whose areas do not match the contract", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, [{ area: "stock", permissions: [{ key: "make_coffee" }] }]),
  );

  expect(await fetchPermissionCatalog()).toEqual({ kind: "failed" });
});
