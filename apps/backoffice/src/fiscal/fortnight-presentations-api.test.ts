import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  type FortnightPresentation,
  fetchFortnightPresentations,
  remedyRejectedDocument,
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

const rejectedDocumentWire = {
  number: 17,
  unprocessed: 12,
  issued_on: "2026-09-09",
  total: 1_845_000,
  buyer: { kind: "cuit", number: 20_000_000_001 },
  buyer_tax_status_code: 1,
  rejections: [{ code: 10016, message: "Fictional observation" }],
  remedy: "awaiting_remedy",
};

const partlyRejectedWire = {
  ...blockedWire,
  state: "refused",
  refusal: "partial",
  rejected_document: rejectedDocumentWire,
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
        rejectedDocument: {
          number: 17,
          unprocessed: 12,
          issuedOn: "2026-09-09",
          total: 1_845_000,
          buyer: { kind: "cuit", number: 20_000_000_001 },
          buyerTaxStatusCode: 1,
          rejections: [{ code: 10016, message: "Fictional observation" }],
          remedy: "awaiting_remedy",
        },
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
  [
    "a rejected document whose buyer the cloud does not define",
    [
      {
        ...partlyRejectedWire,
        rejected_document: { ...rejectedDocumentWire, buyer: { kind: "dni" } },
      },
    ],
  ],
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

const reportRemedy = {
  point_of_sale_number: 4,
  fortnight_start: "2026-09-01",
  document_type: "factura_c",
  number: 17,
  remedy: { kind: "report" },
} as const;

test("remedyRejectedDocument posts the remedy and answers ok on 204", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(204));

  expect(await remedyRejectedDocument(reportRemedy)).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith(
    "/api/registers/fortnight-presentations/rejected-document-remedies",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reportRemedy),
    },
  );
});

test("remedyRejectedDocument names the field the cloud refused on 400", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, {
      code: "validation_failed",
      details: [{ field: "remedy.correction.total" }],
    }),
  );

  expect(await remedyRejectedDocument(reportRemedy)).toEqual({
    kind: "validation_failed",
    field: "remedy.correction.total",
  });
});

test("remedyRejectedDocument returns not_found when the presentation has no such document", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "document_not_found" }));

  expect(await remedyRejectedDocument(reportRemedy)).toEqual({ kind: "not_found" });
});

test.each([
  ["not_rejected", { kind: "not_rejected" }],
  ["already_remedied", { kind: "already_remedied" }],
  ["something_else", { kind: "failed" }],
] as const)("remedyRejectedDocument maps the 409 reason %s", async (code, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code }));

  expect(await remedyRejectedDocument(reportRemedy)).toEqual(outcome);
});

test.each([
  "nothing_changed",
  "date_outside_fortnight",
  "date_out_of_order",
  "invalid_total",
  "invalid_buyer_identification",
] as const)("remedyRejectedDocument reads the correction refusal %s on 422", async (refusal) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(422, { code: "correction_refused", refusal }));

  expect(await remedyRejectedDocument(reportRemedy)).toEqual({
    kind: "correction_refused",
    refusal,
  });
});

test.each([
  ["a refusal the cloud does not define", { code: "correction_refused", refusal: "other" }],
  ["another code", { code: "other", refusal: "nothing_changed" }],
])("remedyRejectedDocument returns failed on 422 with %s", async (_name, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(422, body));

  expect(await remedyRejectedDocument(reportRemedy)).toEqual({ kind: "failed" });
});

test("remedyRejectedDocument asks for a fresh authorization on 401 authorization_required", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authorization_required" }));

  expect(await remedyRejectedDocument(reportRemedy)).toEqual({ kind: "authorization_required" });
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("remedyRejectedDocument maps %s", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await remedyRejectedDocument(reportRemedy)).toEqual(outcome);
});

test("remedyRejectedDocument returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(null, { status: 429, headers: { "Retry-After": "45" } }),
  );

  expect(await remedyRejectedDocument(reportRemedy)).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 45,
  });
});

test("remedyRejectedDocument returns failed when the network call throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));

  expect(await remedyRejectedDocument(reportRemedy)).toEqual({ kind: "failed" });
});
