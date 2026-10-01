import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  createFiscalAddress,
  editFiscalAddress,
  type FiscalAddress,
  fetchFiscalAddresses,
} from "./fiscal-addresses-api";

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const wireRow = {
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  name: "Depósito Central",
  street_address: "Calle Ficticia 123, CABA",
  version: 2,
};

const fiscalAddress: FiscalAddress = {
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  name: "Depósito Central",
  streetAddress: "Calle Ficticia 123, CABA",
  version: 2,
};

const creation = { name: "Depósito Central", street_address: "Calle Ficticia 123, CABA" };

test("fetchFiscalAddresses returns the fiscal addresses on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [wireRow]));

  expect(await fetchFiscalAddresses()).toEqual({ kind: "ok", value: [fiscalAddress] });
  expect(fetch).toHaveBeenCalledWith("/api/fiscal-addresses");
});

test("fetchFiscalAddresses returns an empty list on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, []));

  expect(await fetchFiscalAddresses()).toEqual({ kind: "ok", value: [] });
});

test.each([
  ["a body that is not a list", { ...wireRow }],
  ["a row missing a field", [{ ...wireRow, street_address: undefined }]],
  ["a row with a mistyped field", [{ ...wireRow, version: "2" }]],
])("fetchFiscalAddresses returns failed on 200 with %s", async (_name, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  expect(await fetchFiscalAddresses()).toEqual({ kind: "failed" });
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("fetchFiscalAddresses maps %s", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchFiscalAddresses()).toEqual(outcome);
});

test("fetchFiscalAddresses returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(null, { status: 429, headers: { "Retry-After": "45" } }),
  );

  expect(await fetchFiscalAddresses()).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
});

test("fetchFiscalAddresses returns failed when the network call throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));

  expect(await fetchFiscalAddresses()).toEqual({ kind: "failed" });
});

test("createFiscalAddress POSTs the name and the street address", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(201, wireRow));

  expect(await createFiscalAddress(creation)).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith("/api/fiscal-addresses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(creation),
  });
});

test("createFiscalAddress returns name_taken on 409", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "fiscal_address_name_taken" }));

  expect(await createFiscalAddress(creation)).toEqual({ kind: "name_taken" });
});

test("createFiscalAddress returns the field a 400 validation_failed names", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "street_address" }] }),
  );

  expect(await createFiscalAddress(creation)).toEqual({
    kind: "validation_failed",
    field: "street_address",
  });
});

test("createFiscalAddress returns failed on a 400 naming no field", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "validation_failed" }));

  expect(await createFiscalAddress(creation)).toEqual({ kind: "failed" });
});

test("createFiscalAddress returns the failure of a gated write", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authorization_required" }));

  expect(await createFiscalAddress(creation)).toEqual({ kind: "authorization_required" });
});

test("createFiscalAddress returns failed when the network call throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));

  expect(await createFiscalAddress(creation)).toEqual({ kind: "failed" });
});

const edit = { ...creation, version: 2 };

test("editFiscalAddress PUTs the fields and the version to the address", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ...wireRow, version: 3 }));

  expect(await editFiscalAddress("address-1", edit)).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith("/api/fiscal-addresses/address-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(edit),
  });
});

test("editFiscalAddress tells a taken name from a stale version on 409", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "fiscal_address_name_taken" }));
  expect(await editFiscalAddress("address-1", edit)).toEqual({ kind: "name_taken" });

  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "stale_version" }));
  expect(await editFiscalAddress("address-1", edit)).toEqual({ kind: "stale_version" });
});

test("editFiscalAddress returns not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  expect(await editFiscalAddress("address-1", edit)).toEqual({ kind: "not_found" });
});

test("editFiscalAddress returns the field a 400 validation_failed names", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "name" }] }),
  );

  expect(await editFiscalAddress("address-1", edit)).toEqual({
    kind: "validation_failed",
    field: "name",
  });
});

test("editFiscalAddress returns failed when the network call throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));

  expect(await editFiscalAddress("address-1", edit)).toEqual({ kind: "failed" });
});
