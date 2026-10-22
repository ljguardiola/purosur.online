import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { type ClockCorrection, fetchClockCorrections } from "./clock-corrections-api";

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const wire = {
  id: "5b9e2f4a-7c1d-4e83-a6f0-3d8c1b7e9a42",
  corrected_at: "2026-10-05T12:00:00.000Z",
  register_id: "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10",
  register_name: "Caja 1",
  point_of_sale_number: 4,
  document_type: "factura_c",
  actor_id: "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03",
  actor_first_name: "Ada",
  previous_reading: "2026-10-07T12:00:00.000Z",
  previous_reading_source: "clock_mark",
  corrected_reading: "2026-10-05T12:00:00.000Z",
  alert_state: "open",
};

const correction: ClockCorrection = {
  id: "5b9e2f4a-7c1d-4e83-a6f0-3d8c1b7e9a42",
  correctedAt: "2026-10-05T12:00:00.000Z",
  registerId: "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10",
  registerName: "Caja 1",
  pointOfSaleNumber: 4,
  actorFirstName: "Ada",
  previousReading: "2026-10-07T12:00:00.000Z",
  previousReadingSource: "clock_mark",
  correctedReading: "2026-10-05T12:00:00.000Z",
  alertState: "open",
};

test("fetchClockCorrections returns the corrections in the order the cloud sends them", async () => {
  const closed = { ...wire, id: "older", alert_state: "closed" };
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [wire, closed]));

  expect(await fetchClockCorrections()).toEqual({
    kind: "ok",
    value: [correction, { ...correction, id: "older", alertState: "closed" }],
  });
  expect(fetch).toHaveBeenCalledWith("/api/registers/clock-corrections");
});

test("fetchClockCorrections tells a previous reading derived from the tax authority's day from a mark's", async () => {
  const derived = { ...wire, previous_reading_source: "tax_authority_day" };
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [derived]));

  expect(await fetchClockCorrections()).toEqual({
    kind: "ok",
    value: [{ ...correction, previousReadingSource: "tax_authority_day" }],
  });
});

test.each([
  ["a body that is not a list", wire],
  [
    "a row without where its previous reading came from",
    [{ ...wire, previous_reading_source: undefined }],
  ],
  ["a row missing a field", [{ ...wire, register_name: undefined }]],
  ["an alert state it does not know", [{ ...wire, alert_state: "snoozed" }]],
])("fetchClockCorrections returns failed on 200 with %s", async (_name, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  expect(await fetchClockCorrections()).toEqual({ kind: "failed" });
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("fetchClockCorrections maps %s", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchClockCorrections()).toEqual(outcome);
});

test("fetchClockCorrections returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(null, { status: 429, headers: { "Retry-After": "45" } }),
  );

  expect(await fetchClockCorrections()).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
});

test("fetchClockCorrections returns failed when the network call throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));

  expect(await fetchClockCorrections()).toEqual({ kind: "failed" });
});
