import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  fetchSupplierItemLinkChoices,
  fetchSupplierItemLinkProposal,
} from "./supplier-item-links-api";
import {
  LINK_CHOICES,
  PROPOSED_BY_AI,
  UNAVAILABLE_PROPOSAL,
} from "./test-support/supplier-item-links";

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
  [404, { kind: "failed" }],
  [500, { kind: "failed" }],
] as const;

describe("fetchSupplierItemLinkProposal", () => {
  test("reads the proposal made for the row of the list", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, PROPOSED_BY_AI));

    expect(await fetchSupplierItemLinkProposal("list-1", "row-1")).toEqual({
      kind: "ok",
      value: PROPOSED_BY_AI,
    });
    expect(fetch).toHaveBeenCalledWith("/api/supplier-price-lists/list-1/rows/row-1/link-proposal");
  });

  test("reads a proposal that could not be made", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, UNAVAILABLE_PROPOSAL));

    expect(await fetchSupplierItemLinkProposal("list-1", "row-1")).toEqual({
      kind: "ok",
      value: UNAVAILABLE_PROPOSAL,
    });
  });

  test("returns failed when the proposal does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { kind: "guessed" }));

    expect(await fetchSupplierItemLinkProposal("list-1", "row-1")).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchSupplierItemLinkProposal("list-1", "row-1")).toEqual(outcome);
  });
});

describe("fetchSupplierItemLinkChoices", () => {
  test("reads the products with the packagings an item may be linked to", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, LINK_CHOICES));

    expect(await fetchSupplierItemLinkChoices()).toEqual({ kind: "ok", value: LINK_CHOICES });
    expect(fetch).toHaveBeenCalledWith("/api/supplier-price-lists/link-choices");
  });

  test("returns failed when the choices do not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { products: [{ id: 1 }] }));

    expect(await fetchSupplierItemLinkChoices()).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchSupplierItemLinkChoices()).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "12" }));

    expect(await fetchSupplierItemLinkChoices()).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 12,
    });
  });
});
