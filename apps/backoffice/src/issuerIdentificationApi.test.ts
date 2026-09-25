import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  fetchIssuerIdentification,
  type IssuerIdentification,
  saveIssuerIdentification,
} from "./issuerIdentificationApi";

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
  legal_name: "María Laura Fernández",
  gross_income_registration: "1284531-06",
  activity_start_date: "2019-03-01",
  authorized_cuit: "27-28453196-0",
  tax_status: "Responsable Monotributo",
  version: 1,
};

const issuerIdentification: IssuerIdentification = {
  legalName: "María Laura Fernández",
  grossIncomeRegistration: "1284531-06",
  activityStartDate: "2019-03-01",
  authorizedCuit: "27-28453196-0",
  taxStatus: "Responsable Monotributo",
  version: 1,
};

const saveInput = {
  legalName: "María Laura Fernández",
  grossIncomeRegistration: "1284531-06",
  activityStartDate: "2019-03-01",
  version: 1,
};

test("fetchIssuerIdentification returns the issuer identification on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, wireRow));

  const outcome = await fetchIssuerIdentification();

  expect(outcome).toEqual({ kind: "ok", value: issuerIdentification });
  expect(fetch).toHaveBeenCalledWith("/fiscal-configuration/issuer-identification");
});

test("fetchIssuerIdentification returns an incomplete identification with null editable fields", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, {
      ...wireRow,
      legal_name: null,
      gross_income_registration: null,
      activity_start_date: null,
    }),
  );

  const outcome = await fetchIssuerIdentification();

  expect(outcome).toEqual({
    kind: "ok",
    value: {
      ...issuerIdentification,
      legalName: null,
      grossIncomeRegistration: null,
      activityStartDate: null,
    },
  });
});

test("fetchIssuerIdentification returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await fetchIssuerIdentification()).toEqual({ kind: "unauthenticated" });
});

test("fetchIssuerIdentification returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await fetchIssuerIdentification()).toEqual({ kind: "forbidden" });
});

test("fetchIssuerIdentification returns failed when the network call throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));

  expect(await fetchIssuerIdentification()).toEqual({ kind: "failed" });
});

test("fetchIssuerIdentification returns failed on an unexpected status", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));

  expect(await fetchIssuerIdentification()).toEqual({ kind: "failed" });
});

test("saveIssuerIdentification PUTs the three editable fields and the version, never the CUIT or tax status, returning the saved identification", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ...wireRow, version: 2 }));

  const outcome = await saveIssuerIdentification(saveInput);

  expect(outcome).toEqual({ kind: "ok", value: { ...issuerIdentification, version: 2 } });
  expect(fetch).toHaveBeenCalledWith("/fiscal-configuration/issuer-identification", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      legal_name: "María Laura Fernández",
      gross_income_registration: "1284531-06",
      activity_start_date: "2019-03-01",
      version: 1,
    }),
  });
});

test("saveIssuerIdentification maps a 400 validation_failed to its field", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, {
      code: "validation_failed",
      message: "legal_name must be a non-empty string of at most 200 characters",
      details: [{ field: "legal_name" }],
    }),
  );

  expect(await saveIssuerIdentification(saveInput)).toEqual({
    kind: "validation_failed",
    field: "legal_name",
  });
});

test("saveIssuerIdentification returns stale_version on 409", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "stale_version" }));

  expect(await saveIssuerIdentification(saveInput)).toEqual({ kind: "stale_version" });
});

test("saveIssuerIdentification returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await saveIssuerIdentification(saveInput)).toEqual({ kind: "forbidden" });
});

test("saveIssuerIdentification returns authorization_required on a 401 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authorization_required" }));

  expect(await saveIssuerIdentification(saveInput)).toEqual({ kind: "authorization_required" });
});

test("saveIssuerIdentification returns unauthenticated on a 401 with no authorization_required code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await saveIssuerIdentification(saveInput)).toEqual({ kind: "unauthenticated" });
});

test("saveIssuerIdentification returns failed when the network call throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));

  expect(await saveIssuerIdentification(saveInput)).toEqual({ kind: "failed" });
});
