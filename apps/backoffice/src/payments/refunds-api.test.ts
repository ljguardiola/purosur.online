import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { confirmRefund, discardRefund, fetchPendingRefunds, markRefundDone } from "./refunds-api";
import {
  CLOUD_SENT_REFUND_ID,
  LATE_PAYMENT_REFUND_ID,
  pendingRefunds,
  TRANSFER_REFUND_ID,
} from "./test-support/refund-fixtures";

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
    [404, undefined, { kind: "not_found" }],
    [409, { code: "already_done" }, { kind: "already_done" }],
    [409, { code: "refund_discarded" }, { kind: "discarded" }],
    [409, { code: "something_else" }, { kind: "failed" }],
    [409, undefined, { kind: "failed" }],
    [401, undefined, { kind: "unauthenticated" }],
    [403, undefined, { kind: "forbidden" }],
    [500, undefined, { kind: "failed" }],
  ])("answers %i with %j as %j", async (status, body, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status, body));

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

describe("discardRefund", () => {
  const discarded = { refund_id: LATE_PAYMENT_REFUND_ID, discarded_at: "2026-10-08T14:00:00.000Z" };

  test("posts the discard of the refund and answers ok", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, discarded));

    expect(await discardRefund(LATE_PAYMENT_REFUND_ID)).toEqual({ kind: "ok" });
    expect(fetch).toHaveBeenCalledWith(`/api/refunds/${LATE_PAYMENT_REFUND_ID}/discard`, {
      method: "POST",
    });
  });

  test("treats a success body that does not match as failed", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { refund_id: "refund-1" }));

    expect(await discardRefund(LATE_PAYMENT_REFUND_ID)).toEqual({ kind: "failed" });
  });

  test.each([
    [404, undefined, { kind: "not_found" }],
    [409, { code: "refund_not_discardable" }, { kind: "not_discardable" }],
    [409, { code: "already_done" }, { kind: "already_done" }],
    [409, { code: "already_discarded" }, { kind: "already_discarded" }],
    [409, { code: "something_else" }, { kind: "failed" }],
    [409, undefined, { kind: "failed" }],
    [401, undefined, { kind: "unauthenticated" }],
    [403, undefined, { kind: "forbidden" }],
    [500, undefined, { kind: "failed" }],
  ])("answers %i with %j as %j", async (status, body, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status, body));

    expect(await discardRefund(LATE_PAYMENT_REFUND_ID)).toEqual(outcome);
  });

  test("reads the retry time of a rate-limited response", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

    expect(await discardRefund(LATE_PAYMENT_REFUND_ID)).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 30,
    });
  });

  test("answers failed when the request cannot be sent", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await discardRefund(LATE_PAYMENT_REFUND_ID)).toEqual({ kind: "failed" });
  });
});

describe("confirmRefund", () => {
  const refund_id = CLOUD_SENT_REFUND_ID;

  test.each([
    { refund_id, outcome: "sent" },
    { refund_id, outcome: "done", done_at: "2026-10-09T10:00:00.000Z" },
    { refund_id, outcome: "insufficient_balance" },
    { refund_id, outcome: "refused", reason: "cannot_refund_order" },
    { refund_id, outcome: "provider_unavailable" },
  ])("posts the confirmation of the refund and answers %j", async (body) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

    expect(await confirmRefund(CLOUD_SENT_REFUND_ID)).toEqual({ kind: "ok", value: body });
    expect(fetch).toHaveBeenCalledWith(`/api/refunds/${CLOUD_SENT_REFUND_ID}/confirmation`, {
      method: "POST",
    });
  });

  test.each([
    { refund_id },
    { refund_id, outcome: "done" },
    { refund_id, outcome: "refused" },
    { refund_id, outcome: "unknown" },
  ])("treats a success body that does not match, %j, as failed", async (body) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

    expect(await confirmRefund(CLOUD_SENT_REFUND_ID)).toEqual({ kind: "failed" });
  });

  test.each([
    [404, undefined, { kind: "not_found" }],
    [409, { code: "refund_not_confirmable" }, { kind: "not_confirmable" }],
    [409, { code: "already_done" }, { kind: "already_done" }],
    [409, { code: "already_confirmed" }, { kind: "already_confirmed" }],
    [409, { code: "refund_not_backed" }, { kind: "not_backed" }],
    [409, { code: "exceeds_refundable" }, { kind: "exceeds_refundable" }],
    [409, { code: "something_else" }, { kind: "failed" }],
    [409, undefined, { kind: "failed" }],
    [503, { code: "payment_provider_not_configured" }, { kind: "not_configured" }],
    [503, undefined, { kind: "failed" }],
    [401, undefined, { kind: "unauthenticated" }],
    [403, undefined, { kind: "forbidden" }],
    [500, undefined, { kind: "failed" }],
  ])("answers %i with %j as %j", async (status, body, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status, body));

    expect(await confirmRefund(CLOUD_SENT_REFUND_ID)).toEqual(outcome);
  });

  test("reads the retry time of a rate-limited response", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "20" }));

    expect(await confirmRefund(CLOUD_SENT_REFUND_ID)).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 20,
    });
  });

  test("answers failed when the request cannot be sent", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await confirmRefund(CLOUD_SENT_REFUND_ID)).toEqual({ kind: "failed" });
  });
});
