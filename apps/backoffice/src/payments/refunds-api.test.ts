import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fetchPendingRefunds, markRefundDone } from "./refunds-api";
import { pendingRefunds, TRANSFER_REFUND_ID } from "./test-support/refund-fixtures";

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

describe("fetchPendingRefunds", () => {
  test("reads the pending refunds of the branch", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, pendingRefunds));

    expect(await fetchPendingRefunds()).toEqual({ kind: "ok", value: pendingRefunds });
    expect(fetch).toHaveBeenCalledWith("/api/refunds/pending");
  });

  test.each([
    [401, { kind: "unauthenticated" }],
    [403, { kind: "forbidden" }],
    [500, { kind: "failed" }],
  ])("answers %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchPendingRefunds()).toEqual(outcome);
  });

  test("reads the retry time of a rate-limited response", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "12" }));

    expect(await fetchPendingRefunds()).toEqual({ kind: "rate_limited", retryAfterSeconds: 12 });
  });

  test("treats a body that does not match the pending refunds as failed", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { refunds: [{ id: "refund-1" }] }));

    expect(await fetchPendingRefunds()).toEqual({ kind: "failed" });
  });

  test("answers failed when the request cannot be sent", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

    expect(await fetchPendingRefunds()).toEqual({ kind: "failed" });
  });
});

describe("markRefundDone", () => {
  const done = { refund_id: TRANSFER_REFUND_ID, done_at: "2026-10-08T14:00:00.000Z" };

  test("posts the completion of the refund and answers ok", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, done));

    expect(await markRefundDone(TRANSFER_REFUND_ID)).toEqual({ kind: "ok" });
    expect(fetch).toHaveBeenCalledWith(`/api/refunds/${TRANSFER_REFUND_ID}/completion`, {
      method: "POST",
    });
  });

  test("treats a success body that does not match as failed", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { refund_id: "refund-1" }));

    expect(await markRefundDone(TRANSFER_REFUND_ID)).toEqual({ kind: "failed" });
  });

  test.each([
    [404, { kind: "not_found" }],
    [409, { kind: "already_done" }],
    [401, { kind: "unauthenticated" }],
    [403, { kind: "forbidden" }],
    [500, { kind: "failed" }],
  ])("answers %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await markRefundDone(TRANSFER_REFUND_ID)).toEqual(outcome);
  });

  test("reads the retry time of a rate-limited response", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

    expect(await markRefundDone(TRANSFER_REFUND_ID)).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 45,
    });
  });

  test("answers failed when the request cannot be sent", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await markRefundDone(TRANSFER_REFUND_ID)).toEqual({ kind: "failed" });
  });
});
