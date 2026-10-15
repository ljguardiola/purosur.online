import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  type FortnightPresentation,
  fetchFortnightPresentations,
} from "./fortnight-presentations-api";

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const blockedWire = {
  register_id: "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10",
  point_of_sale_number: 4,
  fortnight_start: "2026-09-01",
  fortnight_end: "2026-09-15",
  deadline: "2026-09-23",
  document_type: "factura_c",
  document_count: 36,
  rejected_document: null,
  movement: "documents",
  refusal: null,
  state: "blocked",
};

const pendingWire = {
  ...blockedWire,
  point_of_sale_number: 5,
  document_type: null,
  document_count: 0,
  movement: null,
  state: null,
};

const blocked: FortnightPresentation = {
  registerId: "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10",
  pointOfSaleNumber: 4,
  fortnight: { start: "2026-09-01", end: "2026-09-15" },
  deadline: "2026-09-23",
  documentType: "factura_c",
  documentCount: 36,
  rejectedDocument: null,
  movement: "documents",
  refusal: null,
  state: "blocked",
};

const pending: FortnightPresentation = {
  ...blocked,
  pointOfSaleNumber: 5,
  documentType: null,
  documentCount: 0,
  movement: null,
  state: null,
};

const partlyRejectedWire = {
  ...blockedWire,
  state: "refused",
  refusal: "partial",
  rejected_document: { number: 17, unprocessed: 12 },
};

test("fetchFortnightPresentations returns the branch's presentations with their state and deadline", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [blockedWire, pendingWire]));

  expect(await fetchFortnightPresentations()).toEqual({
    kind: "ok",
    value: [blocked, pending],
  });
  expect(fetch).toHaveBeenCalledWith("/api/registers/fortnight-presentations");
});

test("fetchFortnightPresentations reads how a presentation was refused, the rejected document and the documents left unprocessed after it", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [partlyRejectedWire]));

  expect(await fetchFortnightPresentations()).toEqual({
    kind: "ok",
    value: [
      {
        ...blocked,
        state: "refused",
        refusal: "partial",
        rejectedDocument: { number: 17, unprocessed: 12 },
      },
    ],
  });
});

test("fetchFortnightPresentations reads what a presentation without documents declared", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, [{ ...pendingWire, state: "accepted", movement: "none" }]),
  );

  expect(await fetchFortnightPresentations()).toEqual({
    kind: "ok",
    value: [{ ...pending, state: "accepted", movement: "none" }],
  });
});

test.each([
  ["a body that is not a list", blockedWire],
  ["a row missing a field", [{ ...blockedWire, deadline: undefined }]],
  ["a row missing its document count", [{ ...blockedWire, document_count: undefined }]],
  ["a document type the cloud does not define", [{ ...blockedWire, document_type: "factura_a" }]],
  ["a state the cloud does not define", [{ ...blockedWire, state: "paused" }]],
])("fetchFortnightPresentations returns failed on 200 with %s", async (_name, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  expect(await fetchFortnightPresentations()).toEqual({ kind: "failed" });
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("fetchFortnightPresentations maps %s", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchFortnightPresentations()).toEqual(outcome);
});

test("fetchFortnightPresentations returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(null, { status: 429, headers: { "Retry-After": "45" } }),
  );

  expect(await fetchFortnightPresentations()).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 45,
  });
});

test("fetchFortnightPresentations returns failed when the network call throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));

  expect(await fetchFortnightPresentations()).toEqual({ kind: "failed" });
});
