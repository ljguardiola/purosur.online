import type { FreightBody, FreightList } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  editFreight,
  fetchFreights,
  fetchLinkablePurchases,
  recordFreight,
} from "./freights-api";
import {
  compraAndina,
  compraMolinos,
  envioDesdeBuenosAires,
  recordedEnvio,
  retiroEnElMolino,
} from "./test-support/freights";

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

const freightBody: FreightBody = {
  date: "2026-09-12",
  amountCents: 1_850_000,
  description: "Envío desde Buenos Aires",
  means: { kind: "carrier", name: "Expreso Sur" },
  purchaseIds: [compraAndina.id, compraMolinos.id],
};

const refusals = [
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
] as const;

const freights: FreightList = {
  items: [envioDesdeBuenosAires, retiroEnElMolino],
  count: 2,
  totalCents: 2_750_000,
};

describe("fetchFreights", () => {
  test("lists the freights of the period with their count and total on 200", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, freights));

    expect(await fetchFreights({ period: 90, search: "" })).toEqual({ kind: "ok", value: freights });
    expect(fetch).toHaveBeenCalledWith("/api/freights?period=90");
  });

  test("asks for the searched text", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, freights));

    await fetchFreights({ period: 30, search: "expreso sur" });

    expect(fetch).toHaveBeenCalledWith("/api/freights?period=30&search=expreso+sur");
  });

  test("returns failed when the list does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { items: [{ id: "x" }] }));

    expect(await fetchFreights({ period: 90, search: "" })).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchFreights({ period: 90, search: "" })).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

    expect(await fetchFreights({ period: 90, search: "" })).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 45,
    });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await fetchFreights({ period: 90, search: "" })).toEqual({ kind: "failed" });
  });
});

describe("fetchLinkablePurchases", () => {
  test("lists the purchases a freight may be linked to on 200", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [compraAndina, compraMolinos]));

    expect(await fetchLinkablePurchases({ period: 365 })).toEqual({
      kind: "ok",
      value: [compraAndina, compraMolinos],
    });
    expect(fetch).toHaveBeenCalledWith("/api/freights/linkable-purchases?period=365");
  });

  test("asks for the purchases a freight already covers as well", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, []));

    await fetchLinkablePurchases({ period: 90, freightId: envioDesdeBuenosAires.id });

    expect(fetch).toHaveBeenCalledWith(
      `/api/freights/linkable-purchases?period=90&freightId=${envioDesdeBuenosAires.id}`,
    );
  });

  test("returns failed when the list does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [{ id: "x" }]));

    expect(await fetchLinkablePurchases({ period: 90 })).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchLinkablePurchases({ period: 90 })).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

    expect(await fetchLinkablePurchases({ period: 90 })).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 45,
    });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await fetchLinkablePurchases({ period: 90 })).toEqual({ kind: "failed" });
  });
});

describe.each([
  {
    name: "recordFreight",
    send: () => recordFreight(freightBody),
    okStatus: 201,
    path: "/api/freights",
    method: "POST",
  },
  {
    name: "editFreight",
    send: () => editFreight(recordedEnvio.id, freightBody),
    okStatus: 200,
    path: `/api/freights/${recordedEnvio.id}`,
    method: "PUT",
  },
])("$name", ({ send, okStatus, path, method }) => {
  test("sends the freight and answers the saved one", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(okStatus, recordedEnvio));

    expect(await send()).toEqual({ kind: "ok", freight: recordedEnvio });
    expect(fetch).toHaveBeenCalledWith(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(freightBody),
    });
  });

  test("returns failed when the saved freight does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(okStatus, { id: "x" }));

    expect(await send()).toEqual({ kind: "failed" });
  });

  test("names the field a 400 refuses", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, {
        code: "validation_failed",
        message: "a freight cannot be dated in the future",
        details: [{ field: "date" }],
      }),
    );

    expect(await send()).toEqual({ kind: "validation_failed", field: "date" });
  });

  test("returns failed for a 400 that names no field", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "other" }));

    expect(await send()).toEqual({ kind: "failed" });
  });

  test("answers a purchase that is not one of the branch's", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "purchase_not_found" }));

    expect(await send()).toEqual({ kind: "purchase_not_found" });
  });

  test("answers purchases that are worth nothing", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "purchases_without_value" }));

    expect(await send()).toEqual({ kind: "purchases_without_value" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await send()).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

    expect(await send()).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await send()).toEqual({ kind: "failed" });
  });
});

describe("editFreight", () => {
  test("answers a freight that no longer exists", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "freight_not_found" }));

    expect(await editFreight(recordedEnvio.id, freightBody)).toEqual({ kind: "not_found" });
  });
});
