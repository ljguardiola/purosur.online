import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createSupplier,
  deactivateSupplier,
  editSupplier,
  fetchSuppliers,
  reactivateSupplier,
} from "./suppliers-api";
import { suppliersWithCuits } from "./test-support/suppliers";

const { andina, cerealera } = suppliersWithCuits(FICTIONAL_CUIT, ANOTHER_FICTIONAL_CUIT);

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
const input = { name: "Granos del Valle", cuit: "", contact: "", note: "" };

const refusals = [
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
] as const;

describe("fetchSuppliers", () => {
  test("lists every supplier on 200", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [andina, cerealera]));

    expect(await fetchSuppliers()).toEqual({ kind: "ok", value: [andina, cerealera] });
    expect(fetch).toHaveBeenCalledWith("/api/suppliers");
  });

  test("returns failed when a listed supplier does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [{ ...andina, active: "yes" }]));

    expect(await fetchSuppliers()).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchSuppliers()).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

    expect(await fetchSuppliers()).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await fetchSuppliers()).toEqual({ kind: "failed" });
  });
});

describe("createSupplier", () => {
  test("posts the four fields and answers the created supplier on 201", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, andina));

    expect(await createSupplier(input)).toEqual({ kind: "ok", supplier: andina });
    expect(fetch).toHaveBeenCalledWith("/api/suppliers", {
      method: "POST",
      ...JSON_BODY,
      body: JSON.stringify(input),
    });
  });

  test("returns failed when the created supplier does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, { id: "x" }));

    expect(await createSupplier(input)).toEqual({ kind: "failed" });
  });

  test("returns validation_failed with the field the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", details: [{ field: "cuit" }] }),
    );

    expect(await createSupplier(input)).toEqual({ kind: "validation_failed", field: "cuit" });
  });

  test("returns failed on a 400 that is not a validation failure", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "other" }));

    expect(await createSupplier(input)).toEqual({ kind: "failed" });
  });

  test.each([
    ["supplier_name_taken", { kind: "name_taken" }],
    ["supplier_cuit_taken", { kind: "cuit_taken" }],
    ["something_else", { kind: "failed" }],
  ])("answers a 409 with the code %s as %j", async (code, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code }));

    expect(await createSupplier(input)).toEqual(outcome);
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await createSupplier(input)).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "120" }));

    expect(await createSupplier(input)).toEqual({ kind: "rate_limited", retryAfterSeconds: 120 });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await createSupplier(input)).toEqual({ kind: "failed" });
  });
});

describe("editSupplier", () => {
  test("puts the four fields and the version, and returns ok on 200 whatever the body says", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { unexpected: true }));

    expect(await editSupplier("supplier-1", { ...input, version: 3 })).toEqual({ kind: "ok" });
    expect(fetch).toHaveBeenCalledWith("/api/suppliers/supplier-1", {
      method: "PUT",
      ...JSON_BODY,
      body: JSON.stringify({ ...input, version: 3 }),
    });
  });

  test("returns validation_failed with the field the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", details: [{ field: "note" }] }),
    );

    expect(await editSupplier("supplier-1", { ...input, version: 3 })).toEqual({
      kind: "validation_failed",
      field: "note",
    });
  });

  test("returns not_found on a 404", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

    expect(await editSupplier("supplier-1", { ...input, version: 3 })).toEqual({
      kind: "not_found",
    });
  });

  test.each([
    ["stale_version", { kind: "stale_version" }],
    ["supplier_name_taken", { kind: "name_taken" }],
    ["supplier_cuit_taken", { kind: "cuit_taken" }],
    ["something_else", { kind: "failed" }],
  ])("answers a 409 with the code %s as %j", async (code, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code }));

    expect(await editSupplier("supplier-1", { ...input, version: 3 })).toEqual(outcome);
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await editSupplier("supplier-1", { ...input, version: 3 })).toEqual(outcome);
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await editSupplier("supplier-1", { ...input, version: 3 })).toEqual({
      kind: "failed",
    });
  });
});

describe.each([
  ["deactivateSupplier", deactivateSupplier, "PUT", "supplier_already_inactive"],
  ["reactivateSupplier", reactivateSupplier, "DELETE", "supplier_already_active"],
] as const)("%s", (_name, change, method, alreadyChangedCode) => {
  test(`sends a ${method} to the supplier's deactivation and returns ok on 200`, async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200));

    expect(await change("supplier-1")).toEqual({ kind: "ok" });
    expect(fetch).toHaveBeenCalledWith("/api/suppliers/supplier-1/deactivation", { method });
  });

  test("returns not_found on a 404", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404));

    expect(await change("supplier-1")).toEqual({ kind: "not_found" });
  });

  test("returns already_changed on the 409 that says so, and failed on any other 409", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(409, { code: alreadyChangedCode }));
    expect(await change("supplier-1")).toEqual({ kind: "already_changed" });

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(409, { code: "other" }));
    expect(await change("supplier-1")).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await change("supplier-1")).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

    expect(await change("supplier-1")).toEqual({ kind: "rate_limited", retryAfterSeconds: 30 });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await change("supplier-1")).toEqual({ kind: "failed" });
  });
});
