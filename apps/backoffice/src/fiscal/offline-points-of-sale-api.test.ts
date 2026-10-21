import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  fetchOfflinePointsOfSale,
  type OfflinePointOfSale,
  retireOfflinePointOfSale,
} from "./offline-points-of-sale-api";

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

const freeWire = {
  point_of_sale_number: 6,
  register_id: "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10",
  register_name: "Caja 1",
  retirable: true,
  retired_at: null,
};

const retiredWire = {
  point_of_sale_number: 7,
  register_id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  register_name: "Caja 2",
  retirable: false,
  retired_at: "2026-10-01T15:30:00.000Z",
};

const free: OfflinePointOfSale = {
  pointOfSaleNumber: 6,
  registerId: "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10",
  registerName: "Caja 1",
  retirable: true,
  retiredAt: null,
};

const retired: OfflinePointOfSale = {
  pointOfSaleNumber: 7,
  registerId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  registerName: "Caja 2",
  retirable: false,
  retiredAt: "2026-10-01T15:30:00.000Z",
};

test("fetchOfflinePointsOfSale returns the branch's offline points of sale", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [freeWire, retiredWire]));

  expect(await fetchOfflinePointsOfSale()).toEqual({ kind: "ok", value: [free, retired] });
  expect(fetch).toHaveBeenCalledWith("/api/registers/offline-points-of-sale");
});

test.each([
  ["a body that is not a list", freeWire],
  ["a row missing a field", [{ ...freeWire, register_name: undefined }]],
  ["a number the tax authority does not allow", [{ ...freeWire, point_of_sale_number: 0 }]],
  ["a retirement time that is not a date", [{ ...retiredWire, retired_at: "yesterday" }]],
])("fetchOfflinePointsOfSale returns failed on 200 with %s", async (_name, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  expect(await fetchOfflinePointsOfSale()).toEqual({ kind: "failed" });
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("fetchOfflinePointsOfSale maps %s", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchOfflinePointsOfSale()).toEqual(outcome);
});

test("fetchOfflinePointsOfSale returns failed when the network call throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));

  expect(await fetchOfflinePointsOfSale()).toEqual({ kind: "failed" });
});

test("retireOfflinePointOfSale posts to the point of sale's retirement route and returns when it was retired", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { point_of_sale_number: 6, retired_at: "2026-10-20T12:00:00.000Z" }),
  );

  expect(await retireOfflinePointOfSale(6)).toEqual({
    kind: "retired",
    value: { pointOfSaleNumber: 6, retiredAt: "2026-10-20T12:00:00.000Z" },
  });
  expect(fetch).toHaveBeenCalledWith("/api/registers/offline-points-of-sale/6/retirement", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
});

test.each([
  ["without a retirement time", { point_of_sale_number: 6 }],
  ["with a retirement time that is not a date", { point_of_sale_number: 6, retired_at: "soon" }],
])("retireOfflinePointOfSale returns failed on a 200 %s", async (_name, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  expect(await retireOfflinePointOfSale(6)).toEqual({ kind: "failed" });
});

test("retireOfflinePointOfSale returns failed on a 200 that is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("not json", { status: 200 }));

  expect(await retireOfflinePointOfSale(6)).toEqual({ kind: "failed" });
});

test("retireOfflinePointOfSale returns not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  expect(await retireOfflinePointOfSale(6)).toEqual({ kind: "not_found" });
});

test.each([
  ["assigned", { kind: "assigned" }],
  ["already_retired", { kind: "already_retired" }],
  ["something_else", { kind: "failed" }],
])("retireOfflinePointOfSale maps the 409 %s", async (code, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code }));

  expect(await retireOfflinePointOfSale(6)).toEqual(outcome);
});

test("retireOfflinePointOfSale returns failed on a 400", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "validation_failed" }));

  expect(await retireOfflinePointOfSale(6)).toEqual({ kind: "failed" });
});

test("retireOfflinePointOfSale tells a missing authorization from a missing session on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authorization_required" }));
  expect(await retireOfflinePointOfSale(6)).toEqual({ kind: "authorization_required" });

  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));
  expect(await retireOfflinePointOfSale(6)).toEqual({ kind: "unauthenticated" });
});

test("retireOfflinePointOfSale returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await retireOfflinePointOfSale(6)).toEqual({ kind: "forbidden" });
});

test("retireOfflinePointOfSale returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

  expect(await retireOfflinePointOfSale(6)).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 45,
  });
});

test("retireOfflinePointOfSale returns failed when the network call throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));

  expect(await retireOfflinePointOfSale(6)).toEqual({ kind: "failed" });
});
