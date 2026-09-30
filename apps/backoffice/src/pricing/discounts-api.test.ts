import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fetchDiscounts } from "./discounts-api";
import { almacenTuesdays, discountList, yerbaOff } from "./test-support/discounts";

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

describe("fetchDiscounts", () => {
  test("lists every promotion on 200", async () => {
    const body = discountList([yerbaOff, almacenTuesdays]);
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

    expect(await fetchDiscounts()).toEqual({ kind: "ok", value: body });
    expect(fetch).toHaveBeenCalledWith("/api/discounts");
  });

  test("returns failed when a listed promotion does not have the expected shape", async () => {
    const body = { discounts: [{ ...yerbaOff, benefit: { kind: "PERCENT_OFF", percent: "15" } }] };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

    expect(await fetchDiscounts()).toEqual({ kind: "failed" });
  });

  test("returns failed when the body is not JSON", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("not json", { status: 200 }));

    expect(await fetchDiscounts()).toEqual({ kind: "failed" });
  });

  test.each([
    [401, { kind: "unauthenticated" }],
    [403, { kind: "forbidden" }],
    [500, { kind: "failed" }],
  ])("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchDiscounts()).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

    expect(await fetchDiscounts()).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await fetchDiscounts()).toEqual({ kind: "failed" });
  });
});
