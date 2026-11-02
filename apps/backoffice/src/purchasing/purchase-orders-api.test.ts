import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  buildPurchaseOrders,
  cancelPurchaseOrder,
  editPurchaseOrderLines,
  fetchPurchaseOrder,
  fetchPurchaseOrderPdf,
  fetchPurchaseOrders,
  fetchPurchaseOrderText,
  sharePurchaseOrder,
} from "./purchase-orders-api";
import {
  CANCELLED_SUMMARY,
  DRAFT_ORDER,
  DRAFT_SUMMARY,
  ORDER_ID,
  SENT_ORDER,
  SUPPLIER_ID,
} from "./test-support/purchase-orders";
import { AVENA_PRODUCT_ID, MIEL_PRODUCT_ID } from "./test-support/purchase-products";

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

const JSON_BODY = { headers: { "Content-Type": "application/json" } };

const refusals = [
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
] as const;

describe("fetchPurchaseOrders", () => {
  test("lists every order when no state is asked for", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [DRAFT_SUMMARY, CANCELLED_SUMMARY]));

    expect(await fetchPurchaseOrders("ALL")).toEqual({
      kind: "ok",
      value: [DRAFT_SUMMARY, CANCELLED_SUMMARY],
    });
    expect(fetch).toHaveBeenCalledWith("/api/purchase-orders");
  });

  test("asks the cloud for the orders in one state", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [CANCELLED_SUMMARY]));

    expect(await fetchPurchaseOrders("CANCELLED")).toEqual({
      kind: "ok",
      value: [CANCELLED_SUMMARY],
    });
    expect(fetch).toHaveBeenCalledWith("/api/purchase-orders?state=CANCELLED");
  });

  test("returns failed when a listed order does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [{ ...DRAFT_SUMMARY, state: "SENT" }]));

    expect(await fetchPurchaseOrders("ALL")).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchPurchaseOrders("ALL")).toEqual(outcome);
  });

  test("returns failed when the request cannot be sent", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

    expect(await fetchPurchaseOrders("ALL")).toEqual({ kind: "failed" });
  });
});

describe("fetchPurchaseOrder", () => {
  test("reads the order with its lines", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, DRAFT_ORDER));

    expect(await fetchPurchaseOrder(ORDER_ID)).toEqual({
      kind: "ok",
      value: { kind: "found", order: DRAFT_ORDER },
    });
    expect(fetch).toHaveBeenCalledWith(`/api/purchase-orders/${ORDER_ID}`);
  });

  test("reports an order that does not exist as not found", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "purchase_order_not_found" }));

    expect(await fetchPurchaseOrder(ORDER_ID)).toEqual({
      kind: "ok",
      value: { kind: "not_found" },
    });
  });

  test("returns failed when the order does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ...DRAFT_ORDER, lines: "none" }));

    expect(await fetchPurchaseOrder(ORDER_ID)).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchPurchaseOrder(ORDER_ID)).toEqual(outcome);
  });
});

const choices = [{ productId: MIEL_PRODUCT_ID, supplierId: SUPPLIER_ID, packages: 3 }];

describe("buildPurchaseOrders", () => {
  test("posts the choices and returns the ids of the orders created", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, { orderIds: [ORDER_ID] }));

    expect(await buildPurchaseOrders({ choices })).toEqual({ kind: "ok", orderIds: [ORDER_ID] });
    expect(fetch).toHaveBeenCalledWith("/api/purchase-orders", {
      method: "POST",
      ...JSON_BODY,
      body: JSON.stringify({ choices }),
    });
  });

  test("returns failed when the answer does not list the orders created", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, { orderIds: "none" }));

    expect(await buildPurchaseOrders({ choices })).toEqual({ kind: "failed" });
  });

  test("names the field the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", details: [{ field: "packages" }] }),
    );

    expect(await buildPurchaseOrders({ choices })).toEqual({
      kind: "validation_failed",
      field: "packages",
    });
  });

  test.each([
    ["supplier_not_purchasable"],
    ["product_not_purchasable"],
    ["offer_unavailable"],
  ] as const)("reports a 409 %s", async (code) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code }));

    expect(await buildPurchaseOrders({ choices })).toEqual({ kind: "refused", reason: code });
  });

  test("returns failed for a 409 it does not know", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "other" }));

    expect(await buildPurchaseOrders({ choices })).toEqual({ kind: "failed" });
  });

  test("returns failed for a 400 without a field", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "validation_failed" }));

    expect(await buildPurchaseOrders({ choices })).toEqual({ kind: "failed" });
  });

  test("returns the retry time of a rate-limited answer", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

    expect(await buildPurchaseOrders({ choices })).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 30,
    });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await buildPurchaseOrders({ choices })).toEqual(outcome);
  });

  test("returns failed when the request cannot be sent", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

    expect(await buildPurchaseOrders({ choices })).toEqual({ kind: "failed" });
  });
});

const lines = [
  { productId: MIEL_PRODUCT_ID, packages: 4, quantityPerPackage: 12_000 },
  { productId: AVENA_PRODUCT_ID, packages: 2, quantityPerPackage: 25_000 },
];

describe("editPurchaseOrderLines", () => {
  test("puts the lines and returns the order as saved", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, DRAFT_ORDER));

    expect(await editPurchaseOrderLines(ORDER_ID, { lines })).toEqual({
      kind: "ok",
      order: DRAFT_ORDER,
    });
    expect(fetch).toHaveBeenCalledWith(`/api/purchase-orders/${ORDER_ID}/lines`, {
      method: "PUT",
      ...JSON_BODY,
      body: JSON.stringify({ lines }),
    });
  });

  test("returns failed when the saved order does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { id: ORDER_ID }));

    expect(await editPurchaseOrderLines(ORDER_ID, { lines })).toEqual({ kind: "failed" });
  });

  test("names the field the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", details: [{ field: "productId" }] }),
    );

    expect(await editPurchaseOrderLines(ORDER_ID, { lines })).toEqual({
      kind: "validation_failed",
      field: "productId",
    });
  });

  test("reports an order that does not exist", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "purchase_order_not_found" }));

    expect(await editPurchaseOrderLines(ORDER_ID, { lines })).toEqual({ kind: "not_found" });
  });

  test("reports an order that is no longer a draft", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "purchase_order_not_editable" }));

    expect(await editPurchaseOrderLines(ORDER_ID, { lines })).toEqual({ kind: "not_editable" });
  });

  test("reports a product that can no longer be bought", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "product_not_purchasable" }));

    expect(await editPurchaseOrderLines(ORDER_ID, { lines })).toEqual({
      kind: "product_not_purchasable",
    });
  });

  test("returns failed for a 404 or 409 it does not know", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(404, { code: "other" }));
    expect(await editPurchaseOrderLines(ORDER_ID, { lines })).toEqual({ kind: "failed" });

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(409, { code: "other" }));
    expect(await editPurchaseOrderLines(ORDER_ID, { lines })).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await editPurchaseOrderLines(ORDER_ID, { lines })).toEqual(outcome);
  });
});

describe("cancelPurchaseOrder", () => {
  test("posts the cancellation and returns the order as saved", async () => {
    const cancelled = { ...DRAFT_ORDER, state: "CANCELLED" };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, cancelled));

    expect(await cancelPurchaseOrder(ORDER_ID)).toEqual({ kind: "ok", order: cancelled });
    expect(fetch).toHaveBeenCalledWith(`/api/purchase-orders/${ORDER_ID}/cancel`, {
      method: "POST",
    });
  });

  test("reports an order that does not exist", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "purchase_order_not_found" }));

    expect(await cancelPurchaseOrder(ORDER_ID)).toEqual({ kind: "not_found" });
  });

  test("reports an order that can no longer be cancelled", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(409, { code: "purchase_order_not_cancellable" }),
    );

    expect(await cancelPurchaseOrder(ORDER_ID)).toEqual({ kind: "not_cancellable" });
  });

  test("returns failed for a 404 or 409 it does not know", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(404, { code: "other" }));
    expect(await cancelPurchaseOrder(ORDER_ID)).toEqual({ kind: "failed" });

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(409, { code: "other" }));
    expect(await cancelPurchaseOrder(ORDER_ID)).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await cancelPurchaseOrder(ORDER_ID)).toEqual(outcome);
  });
});

describe("sharePurchaseOrder", () => {
  test("posts the sharing and returns the order as saved", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, SENT_ORDER));

    expect(await sharePurchaseOrder(ORDER_ID)).toEqual({ kind: "ok", order: SENT_ORDER });
    expect(fetch).toHaveBeenCalledWith(`/api/purchase-orders/${ORDER_ID}/share`, {
      method: "POST",
    });
  });

  test("returns failed when the saved order does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ...SENT_ORDER, state: "OTHER" }));

    expect(await sharePurchaseOrder(ORDER_ID)).toEqual({ kind: "failed" });
  });

  test("reports an order that does not exist", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "purchase_order_not_found" }));

    expect(await sharePurchaseOrder(ORDER_ID)).toEqual({ kind: "not_found" });
  });

  test("reports an order that can no longer be shared", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "purchase_order_not_shareable" }));

    expect(await sharePurchaseOrder(ORDER_ID)).toEqual({ kind: "not_shareable" });
  });

  test("returns failed for a 404 or 409 it does not know", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(404, { code: "other" }));
    expect(await sharePurchaseOrder(ORDER_ID)).toEqual({ kind: "failed" });

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(409, { code: "other" }));
    expect(await sharePurchaseOrder(ORDER_ID)).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await sharePurchaseOrder(ORDER_ID)).toEqual(outcome);
  });

  test("returns failed when the request cannot be sent", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

    expect(await sharePurchaseOrder(ORDER_ID)).toEqual({ kind: "failed" });
  });
});

describe("fetchPurchaseOrderPdf", () => {
  test("returns the PDF the cloud answers", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("%PDF-1.7", { status: 200, headers: { "Content-Type": "application/pdf" } }),
    );

    const outcome = await fetchPurchaseOrderPdf(ORDER_ID);

    expect(outcome.kind).toBe("ok");
    expect(outcome.kind === "ok" && (await outcome.blob.text())).toBe("%PDF-1.7");
    expect(fetch).toHaveBeenCalledWith(`/api/purchase-orders/${ORDER_ID}/document.pdf`);
  });

  test("reports an order that does not exist", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "purchase_order_not_found" }));

    expect(await fetchPurchaseOrderPdf(ORDER_ID)).toEqual({ kind: "not_found" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchPurchaseOrderPdf(ORDER_ID)).toEqual(outcome);
  });

  test("returns failed when the request cannot be sent", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

    expect(await fetchPurchaseOrderPdf(ORDER_ID)).toEqual({ kind: "failed" });
  });
});

describe("fetchPurchaseOrderText", () => {
  test("returns the text the cloud answers", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("Pedido a Distribuidora Andina", { status: 200 }));

    expect(await fetchPurchaseOrderText(ORDER_ID)).toEqual({
      kind: "ok",
      value: { kind: "found", text: "Pedido a Distribuidora Andina" },
    });
    expect(fetch).toHaveBeenCalledWith(`/api/purchase-orders/${ORDER_ID}/document.txt`);
  });

  test("reports an order that does not exist", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "purchase_order_not_found" }));

    expect(await fetchPurchaseOrderText(ORDER_ID)).toEqual({
      kind: "ok",
      value: { kind: "not_found" },
    });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchPurchaseOrderText(ORDER_ID)).toEqual(outcome);
  });

  test("returns failed when the request cannot be sent", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

    expect(await fetchPurchaseOrderText(ORDER_ID)).toEqual({ kind: "failed" });
  });
});
