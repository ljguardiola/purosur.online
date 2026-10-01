import { cloudError, pushEventsRequestSchema } from "@purosur/contracts";
import type { OutboxEventDraft } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import type { CloudResponse } from "../platform/cloud-client";
import { openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import {
  type PushAttempt,
  type PushToCloudDeps,
  pushResultOf,
  pushToCloud,
  pushWarningOf,
} from "./push-to-cloud";
import { SqliteLocalOutbox } from "./sqlite-local-outbox";
import { SqliteLocalReplica } from "./sqlite-local-replica";
import { appendOutboxEvent } from "./sqlite-outbox";

const CREDENTIALS = { device_id: "a4b1", device_token: "prefix.secret", pepper: "cGVwcGVy" };
const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const TELEMETRY = { wal_size_bytes: 0, disk_free_bytes: 1000, disk_free_ratio: 0.5 };

function draft(number: number): OutboxEventDraft {
  return {
    event_id: `018f0000-0000-7000-8000-00000000000${number}`,
    aggregate_type: "CashSession",
    aggregate_id: "session-1",
    event_type: "cash_session_opened",
    schema_version: 1,
    payload: { opening_float: 5000 },
    occurred_at: "2026-09-30T12:00:00.000Z",
    actor_id: "u1",
  };
}

function registerWithEvents(count: number) {
  const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS);
  const replica = new SqliteLocalReplica(database);
  replica.adoptDevice({ deviceId: CREDENTIALS.device_id, pepper: CREDENTIALS.pepper });
  for (let number = 1; number <= count; number += 1) {
    appendOutboxEvent(database, CHAIN_KEY, draft(number));
  }
  const outbox = new SqliteLocalOutbox(database, () => new Date("2026-10-01T09:30:00.000Z"));
  const acknowledged = () =>
    database
      .prepare<[], { device_seq: number }>(
        "SELECT device_seq FROM outbox WHERE acked_at IS NOT NULL ORDER BY device_seq",
      )
      .all()
      .map((row) => row.device_seq);
  return { database, replica, outbox, acknowledged };
}

function cloudAnswering(answer: (seqs: number[]) => CloudResponse) {
  const requests: { path: string; bearerToken: string; seqs: number[] }[] = [];
  const post = async (path: string, bearerToken: string, body: unknown) => {
    const request = pushEventsRequestSchema.parse(body);
    const seqs = request.events.map((event) => event.device_seq);
    requests.push({ path, bearerToken, seqs });
    return answer(seqs);
  };
  return { post, requests };
}

const acknowledgingEverything = (seqs: number[]): CloudResponse => ({
  kind: "ok",
  body: { status: "ok", ack_seq: seqs.at(-1) },
});

function depsFor(
  register: ReturnType<typeof registerWithEvents>,
  post: PushToCloudDeps["post"],
  overrides: Partial<PushToCloudDeps> = {},
): PushToCloudDeps {
  return {
    readCredentials: async () => CREDENTIALS,
    outbox: register.outbox,
    adoptDevice: (device) => register.replica.adoptDevice(device),
    post,
    appVersion: "1.4.2",
    readTelemetry: async () => TELEMETRY,
    ...overrides,
  };
}

describe("a push to the cloud", () => {
  it("sends the outbox with the device token and marks what the cloud received", async () => {
    const register = registerWithEvents(3);
    const { post, requests } = cloudAnswering(acknowledgingEverything);

    const attempt = await pushToCloud(depsFor(register, post));

    expect(attempt).toEqual({ kind: "pushed", ackSeq: 3 });
    expect(requests).toEqual([
      { path: "/api/events", bearerToken: "prefix.secret", seqs: [1, 2, 3] },
    ]);
    expect(register.acknowledged()).toEqual([1, 2, 3]);
  });

  it("has nothing to send once everything is acknowledged", async () => {
    const register = registerWithEvents(1);
    const { post, requests } = cloudAnswering(acknowledgingEverything);
    await pushToCloud(depsFor(register, post));

    const attempt = await pushToCloud(depsFor(register, post));

    expect(attempt).toEqual({ kind: "up_to_date" });
    expect(requests).toHaveLength(1);
  });

  it("keeps the events the cloud did not receive, for the next push", async () => {
    const register = registerWithEvents(2);
    const { post } = cloudAnswering(() => ({ kind: "unreachable" }));

    const attempt = await pushToCloud(depsFor(register, post));

    expect(attempt).toEqual({ kind: "failed", failure: { kind: "unreachable" } });
    expect(register.acknowledged()).toEqual([]);
  });

  it("sends the events of the installation the credentials belong to", async () => {
    const register = registerWithEvents(2);
    const { post, requests } = cloudAnswering(acknowledgingEverything);

    await pushToCloud(
      depsFor(register, post, {
        readCredentials: async () => ({ ...CREDENTIALS, device_id: "c9d2" }),
      }),
    );

    expect(requests).toEqual([]);
  });

  it("does nothing before the register is enrolled", async () => {
    const register = registerWithEvents(1);
    const { post, requests } = cloudAnswering(acknowledgingEverything);

    const attempt = await pushToCloud(
      depsFor(register, post, { readCredentials: async () => undefined }),
    );

    expect(attempt).toEqual({ kind: "not_enrolled" });
    expect(requests).toEqual([]);
  });

  it("does nothing when the channel has no cloud", async () => {
    const register = registerWithEvents(1);

    const attempt = await pushToCloud(depsFor(register, undefined));

    expect(attempt).toEqual({ kind: "no_cloud" });
  });

  it("does nothing without a local database", async () => {
    const register = registerWithEvents(1);
    const { post } = cloudAnswering(acknowledgingEverything);

    const attempt = await pushToCloud(
      depsFor(register, post, {
        outbox: undefined,
        readTelemetry: undefined,
      }),
    );

    expect(attempt).toEqual({ kind: "no_local_database" });
  });

  it("does nothing when the app was not told its own version", async () => {
    const register = registerWithEvents(1);
    const { post, requests } = cloudAnswering(acknowledgingEverything);

    const attempt = await pushToCloud(depsFor(register, post, { appVersion: undefined }));

    expect(attempt).toEqual({ kind: "no_app_version" });
    expect(requests).toEqual([]);
  });
});

describe("what a push means for the next one", () => {
  it("counts a register with nothing to push yet, or nothing left, as succeeded", () => {
    for (const attempt of [
      { kind: "up_to_date" },
      { kind: "pushed", ackSeq: 3 },
      { kind: "not_enrolled" },
      { kind: "no_cloud" },
      { kind: "no_local_database" },
    ] as const) {
      expect(pushResultOf(attempt)).toEqual({ kind: "succeeded" });
    }
  });

  it("counts every way of not getting the outbox acknowledged as failed", () => {
    for (const attempt of [
      { kind: "failed", failure: { kind: "unreachable" } },
      { kind: "failed", failure: { kind: "unreadable" } },
      { kind: "failed", failure: { kind: "refused", code: "server_unavailable" } },
      { kind: "gap", expectedSeq: 5 },
      { kind: "stale_device" },
      { kind: "revoked" },
      { kind: "ack_short_of_batch", ackSeq: 2 },
      { kind: "no_app_version" },
    ] as const) {
      expect(pushResultOf(attempt)).toEqual({ kind: "failed" });
    }
  });

  it("carries the wait the cloud asked for, in milliseconds", () => {
    expect(
      pushResultOf({
        kind: "failed",
        failure: { kind: "refused", code: "rate_limited", retryAfterSeconds: 45 },
      }),
    ).toEqual({ kind: "failed", retryAfterMs: 45_000 });
  });
});

describe("what a push is worth warning about", () => {
  it("says an installation the cloud revoked was told so", () => {
    expect(pushWarningOf({ kind: "revoked" })).toMatch(/revoked/);
  });

  it("warns about every stop that is not just being offline", () => {
    for (const attempt of [
      { kind: "failed", failure: { kind: "unreadable" } },
      { kind: "failed", failure: { kind: "refused", code: "server_unavailable" } },
      { kind: "gap", expectedSeq: 5 },
      { kind: "stale_device" },
      { kind: "ack_short_of_batch", ackSeq: 2 },
      { kind: "no_app_version" },
    ] as const satisfies PushAttempt[]) {
      expect(pushWarningOf(attempt)).toEqual(expect.any(String));
    }
  });

  it("stays quiet when the cloud can't be reached or nothing went wrong", () => {
    for (const attempt of [
      { kind: "failed", failure: { kind: "unreachable" } },
      { kind: "up_to_date" },
      { kind: "pushed", ackSeq: 3 },
      { kind: "not_enrolled" },
      { kind: "no_cloud" },
      { kind: "no_local_database" },
    ] as const satisfies PushAttempt[]) {
      expect(pushWarningOf(attempt)).toBeUndefined();
    }
  });
});

describe("a revoked installation", () => {
  it("is reported by the push and keeps its events", async () => {
    const register = registerWithEvents(2);
    const { post } = cloudAnswering(() => ({
      kind: "error",
      error: cloudError("revoked", "this installation was revoked"),
    }));

    const attempt = await pushToCloud(depsFor(register, post));

    expect(attempt).toEqual({ kind: "revoked" });
    expect(register.acknowledged()).toEqual([]);
  });
});
