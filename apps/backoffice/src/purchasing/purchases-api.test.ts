import type { PurchaseRegistrationBody } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fetchPurchaseChoices, fetchPurchases, registerPurchase } from "./purchases-api";
import { compraDeAvena, compraDeMiel, purchaseChoicesFrom } from "./test-support/purchases";

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

const registration: PurchaseRegistrationBody = {
  supplierId: compraDeMiel.supplier.id,
  purchasedOn: "2026-09-14",
  receiptType: "sin_comprobante",
  lines: [
    {
      loadedBy: "quantity",
      productId: compraDeAvena.lines[0]?.product.id ?? "",
      quantity: 12_500,
      costPaidCents: 2_500_000,
    },
  ],
};

const refusals = [
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
] as const;

describe("fetchPurchases", () => {
  test("lists the purchases on 200", async () => {
    const list = [compraDeMiel, compraDeAvena];
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, list));

    expect(await fetchPurchases()).toEqual({ kind: "ok", value: list });
    expect(fetch).toHaveBeenCalledWith("/api/purchases");
  });

  test("returns failed when the list does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [{ id: "x" }]));

    expect(await fetchPurchases()).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchPurchases()).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

    expect(await fetchPurchases()).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await fetchPurchases()).toEqual({ kind: "failed" });
  });
});

describe("fetchPurchaseChoices", () => {
  test("answers what a purchase may be registered with on 200", async () => {
    const purchaseChoices = purchaseChoicesFrom([]);
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, purchaseChoices));

    expect(await fetchPurchaseChoices()).toEqual({ kind: "ok", value: purchaseChoices });
    expect(fetch).toHaveBeenCalledWith("/api/purchase-choices");
  });

  test("returns failed when the choices do not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { suppliers: [] }));

    expect(await fetchPurchaseChoices()).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchPurchaseChoices()).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

    expect(await fetchPurchaseChoices()).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await fetchPurchaseChoices()).toEqual({ kind: "failed" });
  });
});

describe("registerPurchase", () => {
  test("posts the registration and answers the registered purchase on 201", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, compraDeAvena));

    expect(await registerPurchase(registration)).toEqual({ kind: "ok", purchase: compraDeAvena });
    expect(fetch).toHaveBeenCalledWith("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registration),
    });
  });

  test("returns failed when the registered purchase does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, { id: "x" }));

    expect(await registerPurchase(registration)).toEqual({ kind: "failed" });
  });

  test("returns validation_failed with the field the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", details: [{ field: "purchasedOn" }] }),
    );

    expect(await registerPurchase(registration)).toEqual({
      kind: "validation_failed",
      field: "purchasedOn",
    });
  });

  test("returns validation_failed with the line the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, {
        code: "validation_failed",
        details: [{ field: "lines", lineIndex: 2 }],
      }),
    );

    expect(await registerPurchase(registration)).toEqual({
      kind: "validation_failed",
      field: "lines",
      lineIndex: 2,
    });
  });

  test("returns failed on a 400 that is not a validation failure", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "other" }));

    expect(await registerPurchase(registration)).toEqual({ kind: "failed" });
  });

  test("returns supplier_not_found on a 404 supplier_not_found", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "supplier_not_found" }));

    expect(await registerPurchase(registration)).toEqual({ kind: "supplier_not_found" });
  });

  test("returns supplier_inactive on a 409 supplier_inactive", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "supplier_inactive" }));

    expect(await registerPurchase(registration)).toEqual({ kind: "supplier_inactive" });
  });

  test.each([
    [404, "product_not_found"],
    [409, "product_inactive"],
    [404, "packaging_not_found"],
    [409, "packaging_inactive"],
    [409, "packaging_sale_unit_changed"],
  ] as const)("answers a %i %s as a refusal of its line", async (status, code) => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(status, { code, details: [{ field: "lines", lineIndex: 1 }] }),
    );

    expect(await registerPurchase(registration)).toEqual({
      kind: "line_refused",
      reason: code,
      lineIndex: 1,
    });
  });

  test("returns failed on a refusal of a line that names no line", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "product_inactive" }));

    expect(await registerPurchase(registration)).toEqual({ kind: "failed" });
  });

  test("returns failed on a 409 with another code", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "something_else" }));

    expect(await registerPurchase(registration)).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await registerPurchase(registration)).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "120" }));

    expect(await registerPurchase(registration)).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 120,
    });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await registerPurchase(registration)).toEqual({ kind: "failed" });
  });
});
