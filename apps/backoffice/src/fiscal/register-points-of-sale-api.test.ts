import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  configureRegisterOfflinePointOfSale,
  configureRegisterPointOfSale,
  fetchRegisterPointsOfSale,
  type RegisterPointOfSale,
} from "./register-points-of-sale-api";

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const configuredWire = {
  register_id: "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10",
  register_name: "Caja 1",
  point_of_sale_number: 12,
  fiscal_address_id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  version: 1,
  offline_point_of_sale_number: 13,
  offline_version: 3,
};

const neverConfiguredWire = {
  register_id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  register_name: "Caja 2",
  point_of_sale_number: null,
  fiscal_address_id: null,
  version: 0,
  offline_point_of_sale_number: null,
  offline_version: 0,
};

const configured: RegisterPointOfSale = {
  registerId: "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10",
  registerName: "Caja 1",
  pointOfSaleNumber: 12,
  fiscalAddressId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  version: 1,
  offlinePointOfSaleNumber: 13,
  offlineVersion: 3,
};

const neverConfigured: RegisterPointOfSale = {
  registerId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  registerName: "Caja 2",
  pointOfSaleNumber: null,
  fiscalAddressId: null,
  version: 0,
  offlinePointOfSaleNumber: null,
  offlineVersion: 0,
};

test("fetchRegisterPointsOfSale returns the branch's registers, configured or not", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [configuredWire, neverConfiguredWire]));

  expect(await fetchRegisterPointsOfSale()).toEqual({
    kind: "ok",
    value: [configured, neverConfigured],
  });
  expect(fetch).toHaveBeenCalledWith("/api/registers/points-of-sale");
});

test.each([
  ["a body that is not a list", configuredWire],
  ["a row missing a field", [{ ...configuredWire, register_name: undefined }]],
  ["a number the tax authority does not allow", [{ ...configuredWire, point_of_sale_number: 0 }]],
])("fetchRegisterPointsOfSale returns failed on 200 with %s", async (_name, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  expect(await fetchRegisterPointsOfSale()).toEqual({ kind: "failed" });
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("fetchRegisterPointsOfSale maps %s", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchRegisterPointsOfSale()).toEqual(outcome);
});

test("fetchRegisterPointsOfSale returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(null, { status: 429, headers: { "Retry-After": "45" } }),
  );

  expect(await fetchRegisterPointsOfSale()).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 45,
  });
});

test("fetchRegisterPointsOfSale returns failed when the network call throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));

  expect(await fetchRegisterPointsOfSale()).toEqual({ kind: "failed" });
});

const configuration = {
  point_of_sale_number: 12,
  fiscal_address_id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  version: 1,
};

test("configureRegisterPointOfSale PUTs the number, the fiscal address and the version to the register", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { ...configuration, register_id: "register-1", version: 2 }),
  );

  expect(await configureRegisterPointOfSale("register-1", configuration)).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith("/api/registers/register-1/point-of-sale", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(configuration),
  });
});

test("configureRegisterPointOfSale tells a taken number from a stale version on 409", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "point_of_sale_taken" }));
  expect(await configureRegisterPointOfSale("register-1", configuration)).toEqual({
    kind: "point_of_sale_taken",
  });

  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "stale_version" }));
  expect(await configureRegisterPointOfSale("register-1", configuration)).toEqual({
    kind: "stale_version",
  });
});

test("configureRegisterPointOfSale returns not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  expect(await configureRegisterPointOfSale("register-1", configuration)).toEqual({
    kind: "not_found",
  });
});

test("configureRegisterPointOfSale returns the field a 400 validation_failed names", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "fiscal_address_id" }] }),
  );

  expect(await configureRegisterPointOfSale("register-1", configuration)).toEqual({
    kind: "validation_failed",
    field: "fiscal_address_id",
  });
});

test("configureRegisterPointOfSale returns the failure of a gated write", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await configureRegisterPointOfSale("register-1", configuration)).toEqual({
    kind: "forbidden",
  });
});

test("configureRegisterPointOfSale returns failed when the network call throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));

  expect(await configureRegisterPointOfSale("register-1", configuration)).toEqual({
    kind: "failed",
  });
});

const offlineConfiguration = { point_of_sale_number: 13, version: 3 };

test("configureRegisterOfflinePointOfSale PUTs the number and the version to the register's offline point of sale", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { register_id: "register-1", point_of_sale_number: 13, version: 4 }),
  );

  expect(await configureRegisterOfflinePointOfSale("register-1", offlineConfiguration)).toEqual({
    kind: "ok",
  });
  expect(fetch).toHaveBeenCalledWith("/api/registers/register-1/offline-point-of-sale", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(offlineConfiguration),
  });
});

test.each([
  ["point_of_sale_taken", { kind: "point_of_sale_taken" }],
  ["stale_version", { kind: "stale_version" }],
  ["real_time_point_of_sale_missing", { kind: "real_time_point_of_sale_missing" }],
])("configureRegisterOfflinePointOfSale maps the 409 %s", async (code, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code }));

  expect(await configureRegisterOfflinePointOfSale("register-1", offlineConfiguration)).toEqual(
    outcome,
  );
});

test.each([
  [404, { code: "not_found" }, { kind: "not_found" }],
  [
    400,
    { code: "validation_failed", details: [{ field: "point_of_sale_number" }] },
    { kind: "validation_failed", field: "point_of_sale_number" },
  ],
  [403, undefined, { kind: "forbidden" }],
])("configureRegisterOfflinePointOfSale maps %s", async (status, body, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status, body));

  expect(await configureRegisterOfflinePointOfSale("register-1", offlineConfiguration)).toEqual(
    outcome,
  );
});
