import type { PurchaseOrderReceiptBody, PurchaseOrderReceiptDraft } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  fetchPurchaseOrderReceiptDraft,
  receivePurchaseOrder,
} from "./purchase-order-receipts-api";
import { ORDER_ID, RECEIPT_PURCHASE_ID, SUPPLIER_ID } from "./test-support/purchase-orders";
import { MIEL_PRODUCT_ID } from "./test-support/purchase-products";

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

const refusals = [
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
] as const;

const draft: PurchaseOrderReceiptDraft = {
  supplier: { id: SUPPLIER_ID, name: "Distribuidora Andina" },
  lines: [
    {
      loadedBy: "packages",
      product: {
        id: MIEL_PRODUCT_ID,
        name: "Miel pura de abeja 1 kg",
        brandName: null,
        netContent: null,
        saleUnit: "UNIT",
      },
      packages: 3,
      quantityPerPackage: 12_000,
      listCostPerPackageCents: 185_000,
    },
  ],
};

describe("fetchPurchaseOrderReceiptDraft", () => {
  test("reads the draft of the purchase the order would become", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, draft));

    expect(await fetchPurchaseOrderReceiptDraft(ORDER_ID)).toEqual({
      kind: "ok",
      value: { kind: "found", draft },
    });
    expect(fetch).toHaveBeenCalledWith(`/api/purchase-orders/${ORDER_ID}/receipt-draft`);
  });

  test("reports an order that does not exist as not found", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "purchase_order_not_found" }));

    expect(await fetchPurchaseOrderReceiptDraft(ORDER_ID)).toEqual({
      kind: "ok",
      value: { kind: "not_found" },
    });
  });

  test("reports an order that can no longer be received", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(409, { code: "purchase_order_not_receivable" }),
    );

    expect(await fetchPurchaseOrderReceiptDraft(ORDER_ID)).toEqual({
      kind: "ok",
      value: { kind: "not_receivable" },
    });
  });

  test("returns failed for a 409 it does not know", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "other" }));

    expect(await fetchPurchaseOrderReceiptDraft(ORDER_ID)).toEqual({ kind: "failed" });
  });

  test("returns failed when the draft does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ...draft, lines: "none" }));

    expect(await fetchPurchaseOrderReceiptDraft(ORDER_ID)).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchPurchaseOrderReceiptDraft(ORDER_ID)).toEqual(outcome);
  });
});

const receipt: PurchaseOrderReceiptBody = {
  purchasedOn: "2026-09-14",
  receiptType: "sin_comprobante",
  lines: [
    { loadedBy: "quantity", productId: MIEL_PRODUCT_ID, quantity: 24_000, costPaidCents: 100_000 },
  ],
};

describe("receivePurchaseOrder", () => {
  test("posts the receipt and answers the purchase it created and the order's new state", async () => {
    const received = { purchaseId: RECEIPT_PURCHASE_ID, state: "PARTIALLY_RECEIVED" };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, received));

    expect(await receivePurchaseOrder(ORDER_ID, receipt)).toEqual({
      kind: "ok",
      receipt: received,
    });
    expect(fetch).toHaveBeenCalledWith(`/api/purchase-orders/${ORDER_ID}/receipts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(receipt),
    });
  });

  test("returns failed when the answer does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, { purchaseId: 3 }));

    expect(await receivePurchaseOrder(ORDER_ID, receipt)).toEqual({ kind: "failed" });
  });

  test("reports an order that does not exist", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "purchase_order_not_found" }));

    expect(await receivePurchaseOrder(ORDER_ID, receipt)).toEqual({ kind: "not_found" });
  });

  test("reports an order that can no longer be received", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(409, { code: "purchase_order_not_receivable" }),
    );

    expect(await receivePurchaseOrder(ORDER_ID, receipt)).toEqual({ kind: "not_receivable" });
  });

  test("reports a receipt of products none of which was ordered", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "nothing_ordered_received" }));

    expect(await receivePurchaseOrder(ORDER_ID, receipt)).toEqual({
      kind: "nothing_ordered_received",
    });
  });

  test("reads the refusals a purchase gives: the field and the line the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(400, {
        code: "validation_failed",
        details: [{ field: "lines", lineIndex: 1 }],
      }),
    );
    expect(await receivePurchaseOrder(ORDER_ID, receipt)).toEqual({
      kind: "validation_failed",
      field: "lines",
      lineIndex: 1,
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(409, {
        code: "product_inactive",
        details: [{ field: "lines", lineIndex: 0 }],
      }),
    );
    expect(await receivePurchaseOrder(ORDER_ID, receipt)).toEqual({
      kind: "line_refused",
      reason: "product_inactive",
      lineIndex: 0,
    });
  });

  test("reads the refusals about the order's supplier", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(404, { code: "supplier_not_found" }));
    expect(await receivePurchaseOrder(ORDER_ID, receipt)).toEqual({ kind: "supplier_not_found" });

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(409, { code: "supplier_inactive" }));
    expect(await receivePurchaseOrder(ORDER_ID, receipt)).toEqual({ kind: "supplier_inactive" });
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

    expect(await receivePurchaseOrder(ORDER_ID, receipt)).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 30,
    });
  });

  test("returns failed when the request cannot be sent", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

    expect(await receivePurchaseOrder(ORDER_ID, receipt)).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await receivePurchaseOrder(ORDER_ID, receipt)).toEqual(outcome);
  });
});
