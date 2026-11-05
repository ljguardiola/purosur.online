import type { PurchaseHeaderCorrectionBody, PurchaseLinesAdditionBody } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  addPurchaseLines,
  correctPurchaseHeader,
  correctPurchaseLineCost,
  correctPurchaseLineExpiry,
  fetchPurchaseChanges,
  splitPurchaseLineExpiry,
} from "./purchases-api";
import {
  headerCorrection,
  lineExpiryCorrection,
  linesAdded,
} from "./test-support/purchase-changes";
import { compraDeAvena, compraDeMiel } from "./test-support/purchases";

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

const purchaseId = compraDeMiel.id;
const lineId = compraDeMiel.lines[0]?.id ?? "";

const refusals = [
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
] as const;

const addition: PurchaseLinesAdditionBody = {
  lines: [
    {
      loadedBy: "quantity",
      productId: compraDeAvena.lines[0]?.product.id ?? "",
      quantity: 10_000,
      costPaidCents: 1_800_00,
    },
  ],
};

const headerBody: PurchaseHeaderCorrectionBody = {
  purchasedOn: "2026-09-13",
  receiptType: "factura_b",
  receiptNumber: "0001-00001243",
  note: "",
};

describe("addPurchaseLines", () => {
  test("posts the lines to the purchase and answers the purchase on 201", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, compraDeMiel));

    expect(await addPurchaseLines(purchaseId, addition)).toEqual({
      kind: "ok",
      purchase: compraDeMiel,
    });
    expect(fetch).toHaveBeenCalledWith(`/api/purchases/${purchaseId}/lines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addition),
    });
  });

  test("returns failed when the purchase does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, { id: "x" }));

    expect(await addPurchaseLines(purchaseId, addition)).toEqual({ kind: "failed" });
  });

  test("returns validation_failed with the field the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", details: [{ field: "lines" }] }),
    );

    expect(await addPurchaseLines(purchaseId, addition)).toEqual({
      kind: "validation_failed",
      field: "lines",
    });
  });

  test("returns validation_failed with the line the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, {
        code: "validation_failed",
        details: [{ field: "lines", lineIndex: 1 }],
      }),
    );

    expect(await addPurchaseLines(purchaseId, addition)).toEqual({
      kind: "validation_failed",
      field: "lines",
      lineIndex: 1,
    });
  });

  test.each([
    [404, "product_not_found"],
    [409, "product_inactive"],
  ] as const)("answers a %i %s as a refusal of its line", async (status, code) => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(status, { code, details: [{ field: "lines", lineIndex: 0 }] }),
    );

    expect(await addPurchaseLines(purchaseId, addition)).toEqual({
      kind: "line_refused",
      reason: code,
      lineIndex: 0,
    });
  });

  test("returns not_found on a 404 purchase_not_found", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "purchase_not_found" }));

    expect(await addPurchaseLines(purchaseId, addition)).toEqual({ kind: "not_found" });
  });

  test("returns failed on a refusal of a line that names no line", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "product_inactive" }));

    expect(await addPurchaseLines(purchaseId, addition)).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await addPurchaseLines(purchaseId, addition)).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

    expect(await addPurchaseLines(purchaseId, addition)).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 30,
    });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await addPurchaseLines(purchaseId, addition)).toEqual({ kind: "failed" });
  });
});

describe("correctPurchaseHeader", () => {
  test("patches the purchase and answers the corrected purchase on 200", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, compraDeMiel));

    expect(await correctPurchaseHeader(purchaseId, headerBody)).toEqual({
      kind: "ok",
      purchase: compraDeMiel,
    });
    expect(fetch).toHaveBeenCalledWith(`/api/purchases/${purchaseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(headerBody),
    });
  });

  test("returns failed when the purchase does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { id: "x" }));

    expect(await correctPurchaseHeader(purchaseId, headerBody)).toEqual({ kind: "failed" });
  });

  test("returns validation_failed with the field the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", details: [{ field: "purchasedOn" }] }),
    );

    expect(await correctPurchaseHeader(purchaseId, headerBody)).toEqual({
      kind: "validation_failed",
      field: "purchasedOn",
    });
  });

  test("returns failed on a 400 that is not a validation failure", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "other" }));

    expect(await correctPurchaseHeader(purchaseId, headerBody)).toEqual({ kind: "failed" });
  });

  test("returns not_found on a 404 purchase_not_found", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "purchase_not_found" }));

    expect(await correctPurchaseHeader(purchaseId, headerBody)).toEqual({ kind: "not_found" });
  });

  test("returns unchanged on a 409 purchase_unchanged", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "purchase_unchanged" }));

    expect(await correctPurchaseHeader(purchaseId, headerBody)).toEqual({ kind: "unchanged" });
  });

  test("returns failed on a 409 with another code", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "other" }));

    expect(await correctPurchaseHeader(purchaseId, headerBody)).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await correctPurchaseHeader(purchaseId, headerBody)).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

    expect(await correctPurchaseHeader(purchaseId, headerBody)).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 30,
    });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await correctPurchaseHeader(purchaseId, headerBody)).toEqual({ kind: "failed" });
  });
});

describe("correctPurchaseLineCost", () => {
  test("patches the line's cost and answers the purchase on 200", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, compraDeMiel));

    expect(await correctPurchaseLineCost(purchaseId, lineId, { costPaidCents: 800_00 })).toEqual({
      kind: "ok",
      purchase: compraDeMiel,
    });
    expect(fetch).toHaveBeenCalledWith(`/api/purchases/${purchaseId}/lines/${lineId}/cost`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ costPaidCents: 800_00 }),
    });
  });

  test("returns failed when the purchase does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { id: "x" }));

    expect(await correctPurchaseLineCost(purchaseId, lineId, { costPaidCents: 1 })).toEqual({
      kind: "failed",
    });
  });

  test("returns validation_failed with the field the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", details: [{ field: "costPaidCents" }] }),
    );

    expect(await correctPurchaseLineCost(purchaseId, lineId, { costPaidCents: -1 })).toEqual({
      kind: "validation_failed",
      field: "costPaidCents",
    });
  });

  test("returns unchanged on a 409 cost_unchanged", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "cost_unchanged" }));

    expect(await correctPurchaseLineCost(purchaseId, lineId, { costPaidCents: 1 })).toEqual({
      kind: "unchanged",
    });
  });

  test("returns failed on a 409 with another code", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "expiry_unchanged" }));

    expect(await correctPurchaseLineCost(purchaseId, lineId, { costPaidCents: 1 })).toEqual({
      kind: "failed",
    });
  });

  test.each(["purchase_not_found", "line_not_found"])(
    "returns not_found on a 404 %s",
    async (code) => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code }));

      expect(await correctPurchaseLineCost(purchaseId, lineId, { costPaidCents: 1 })).toEqual({
        kind: "not_found",
      });
    },
  );

  test("returns forbidden on a 403 and unauthenticated on a 401", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(403));
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(401));

    expect(await correctPurchaseLineCost(purchaseId, lineId, { costPaidCents: 1 })).toEqual({
      kind: "forbidden",
    });
    expect(await correctPurchaseLineCost(purchaseId, lineId, { costPaidCents: 1 })).toEqual({
      kind: "unauthenticated",
    });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await correctPurchaseLineCost(purchaseId, lineId, { costPaidCents: 1 })).toEqual({
      kind: "failed",
    });
  });
});

describe("correctPurchaseLineExpiry", () => {
  test("patches the line's expiry and answers the purchase on 200", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, compraDeMiel));

    expect(await correctPurchaseLineExpiry(purchaseId, lineId, { expiresOn: null })).toEqual({
      kind: "ok",
      purchase: compraDeMiel,
    });
    expect(fetch).toHaveBeenCalledWith(`/api/purchases/${purchaseId}/lines/${lineId}/expiry`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresOn: null }),
    });
  });

  test("returns failed when the purchase does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { id: "x" }));

    expect(await correctPurchaseLineExpiry(purchaseId, lineId, { expiresOn: null })).toEqual({
      kind: "failed",
    });
  });

  test("returns validation_failed with the field the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", details: [{ field: "expiresOn" }] }),
    );

    expect(await correctPurchaseLineExpiry(purchaseId, lineId, { expiresOn: "2027" })).toEqual({
      kind: "validation_failed",
      field: "expiresOn",
    });
  });

  test("returns failed on a 400 that is not a validation failure", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "other" }));

    expect(await correctPurchaseLineExpiry(purchaseId, lineId, { expiresOn: null })).toEqual({
      kind: "failed",
    });
  });

  test("returns unchanged on a 409 expiry_unchanged", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "expiry_unchanged" }));

    expect(await correctPurchaseLineExpiry(purchaseId, lineId, { expiresOn: null })).toEqual({
      kind: "unchanged",
    });
  });

  test("returns failed on a 409 with another code", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "other" }));

    expect(await correctPurchaseLineExpiry(purchaseId, lineId, { expiresOn: null })).toEqual({
      kind: "failed",
    });
  });

  test.each(["purchase_not_found", "line_not_found"])(
    "returns not_found on a 404 %s",
    async (code) => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code }));

      expect(
        await correctPurchaseLineExpiry(purchaseId, lineId, { expiresOn: "2027-05-01" }),
      ).toEqual({ kind: "not_found" });
    },
  );

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await correctPurchaseLineExpiry(purchaseId, lineId, { expiresOn: null })).toEqual(
      outcome,
    );
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

    expect(await correctPurchaseLineExpiry(purchaseId, lineId, { expiresOn: null })).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 30,
    });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await correctPurchaseLineExpiry(purchaseId, lineId, { expiresOn: null })).toEqual({
      kind: "failed",
    });
  });
});

describe("splitPurchaseLineExpiry", () => {
  const split = { quantity: 1_000, expiresOn: "2027-11-10" };

  test("posts the split to the line and answers the purchase on 200", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, compraDeMiel));

    expect(await splitPurchaseLineExpiry(purchaseId, lineId, split)).toEqual({
      kind: "ok",
      purchase: compraDeMiel,
    });
    expect(fetch).toHaveBeenCalledWith(
      `/api/purchases/${purchaseId}/lines/${lineId}/expiry-splits`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(split),
      },
    );
  });

  test("returns failed when the purchase does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { id: "x" }));

    expect(await splitPurchaseLineExpiry(purchaseId, lineId, split)).toEqual({ kind: "failed" });
  });

  test("returns validation_failed with the field the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", details: [{ field: "quantity" }] }),
    );

    expect(await splitPurchaseLineExpiry(purchaseId, lineId, split)).toEqual({
      kind: "validation_failed",
      field: "quantity",
    });
  });

  test("returns unchanged on a 409 expiry_unchanged", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "expiry_unchanged" }));

    expect(await splitPurchaseLineExpiry(purchaseId, lineId, split)).toEqual({
      kind: "unchanged",
    });
  });

  test("returns not_enough_in_lot on a 409 not_enough_in_lot", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "not_enough_in_lot" }));

    expect(await splitPurchaseLineExpiry(purchaseId, lineId, split)).toEqual({
      kind: "not_enough_in_lot",
    });
  });

  test("returns failed on a 409 with another code", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "other" }));

    expect(await splitPurchaseLineExpiry(purchaseId, lineId, split)).toEqual({ kind: "failed" });
  });

  test.each(["purchase_not_found", "line_not_found"])(
    "returns not_found on a 404 %s",
    async (code) => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code }));

      expect(await splitPurchaseLineExpiry(purchaseId, lineId, split)).toEqual({
        kind: "not_found",
      });
    },
  );

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await splitPurchaseLineExpiry(purchaseId, lineId, split)).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

    expect(await splitPurchaseLineExpiry(purchaseId, lineId, split)).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 30,
    });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await splitPurchaseLineExpiry(purchaseId, lineId, split)).toEqual({ kind: "failed" });
  });
});

describe("fetchPurchaseChanges", () => {
  test("lists the purchase's changes on 200", async () => {
    const changes = [lineExpiryCorrection, linesAdded, headerCorrection];
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, changes));

    expect(await fetchPurchaseChanges(purchaseId)).toEqual({ kind: "ok", value: changes });
    expect(fetch).toHaveBeenCalledWith(`/api/purchases/${purchaseId}/changes`);
  });

  test("returns failed when the changes do not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [{ id: "x" }]));

    expect(await fetchPurchaseChanges(purchaseId)).toEqual({ kind: "failed" });
  });

  test.each([...refusals, [404, { kind: "failed" }] as const])(
    "answers a %i as %j",
    async (status, outcome) => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

      expect(await fetchPurchaseChanges(purchaseId)).toEqual(outcome);
    },
  );

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

    expect(await fetchPurchaseChanges(purchaseId)).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 45,
    });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await fetchPurchaseChanges(purchaseId)).toEqual({ kind: "failed" });
  });
});
