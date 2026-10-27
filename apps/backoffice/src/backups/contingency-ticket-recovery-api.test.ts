import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  fetchContingencyTicketRecoveries,
  finishContingencyTicketRecovery,
} from "./contingency-ticket-recovery-api";

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

const recoveriesWire = {
  recoveries: [
    {
      recovery_id: "5b1c1c5e-5b0a-4d6e-9d58-0c2f6f0d3a21",
      register_id: "6f1c1c5e-5b0a-4d6e-9d58-0c2f6f0d3a11",
      register_name: "Caja 1",
      opened_at: "2026-09-14T20:22:00.000Z",
    },
  ],
};

const RECOVERY_ID = "5b1c1c5e-5b0a-4d6e-9d58-0c2f6f0d3a21";

const refusals = [
  [401, undefined, { kind: "unauthenticated" }],
  [403, undefined, { kind: "forbidden" }],
  [429, { "Retry-After": "45" }, { kind: "rate_limited", retryAfterSeconds: 45 }],
  [429, undefined, { kind: "failed" }],
  [500, undefined, { kind: "failed" }],
] as const;

test("reads the registers awaiting their ticket recovery", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, recoveriesWire));

  expect(await fetchContingencyTicketRecoveries()).toEqual({ kind: "ok", value: recoveriesWire });
  expect(fetch).toHaveBeenCalledWith("/api/contingency-backup-tickets/recoveries");
});

test.each([
  [{ recoveries: [{ ...recoveriesWire.recoveries[0], opened_at: "yesterday" }] }],
  [{ recoveries: "none" }],
  [[]],
])("fails reading a body that does not match its shape: %j", async (body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  expect(await fetchContingencyTicketRecoveries()).toEqual({ kind: "failed" });
});

test("fails reading a body that is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<html>", { status: 200 }));

  expect(await fetchContingencyTicketRecoveries()).toEqual({ kind: "failed" });
});

test.each(refusals)(
  "reading answers %s (retry header %j) as %j",
  async (status, headers, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status, undefined, headers));

    expect(await fetchContingencyTicketRecoveries()).toEqual(outcome);
  },
);

test("fails reading when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await fetchContingencyTicketRecoveries()).toEqual({ kind: "failed" });
});

test.each(["finished", "already_finished", "not_found"])(
  "finishing a recovery returns what the cloud answered: %s",
  async (outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { outcome }));

    expect(await finishContingencyTicketRecovery(RECOVERY_ID)).toEqual({
      kind: "ok",
      value: { outcome },
    });
    expect(fetch).toHaveBeenCalledWith(
      `/api/contingency-backup-tickets/recoveries/${RECOVERY_ID}/finish`,
      { method: "POST" },
    );
  },
);

test.each([[{ outcome: "exploded" }], [{}], [["finished"]]])(
  "fails finishing on a body that does not match its shape: %j",
  async (body) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

    expect(await finishContingencyTicketRecovery(RECOVERY_ID)).toEqual({ kind: "failed" });
  },
);

test.each(refusals)(
  "finishing answers %s (retry header %j) as %j",
  async (status, headers, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status, undefined, headers));

    expect(await finishContingencyTicketRecovery(RECOVERY_ID)).toEqual(outcome);
  },
);

test("fails finishing when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await finishContingencyTicketRecovery(RECOVERY_ID)).toEqual({ kind: "failed" });
});
