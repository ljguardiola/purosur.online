import { canonicalOutboxEvent } from "@purosur/domain";
import { describe, expect, it, vi } from "vitest";
import { inbox } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { hmacEventChain } from "./hmac-event-chain.js";
import { eventsRouteUnderTest, NOW } from "./test-support/events-route.js";

const CHAIN_KEY = Buffer.alloc(32, 3).toString("base64");

const enqueue = vi.fn<() => Promise<void>>();
const route = eventsRouteUnderTest((transaction) => enqueue(transaction));

function pushOf(deviceSeq: number) {
  const unlinked = {
    event_id: crypto.randomUUID(),
    device_seq: deviceSeq,
    aggregate_type: "CashSession",
    aggregate_id: "session-1",
    event_type: "cash_session_opened",
    schema_version: 1,
    payload: { opened_by: "user-1", opened_at: "2026-10-06T11:00:00.000Z", opening_float: 10000 },
    occurred_at: "2026-10-06T11:00:00.000Z",
    actor_id: "user-1",
  };
  return {
    app_version: "1.4.0",
    telemetry: { wal_size_bytes: 4096, disk_free_bytes: 50_000_000, disk_free_ratio: 0.42 },
    events: [
      {
        ...unlinked,
        chain_hmac: hmacEventChain.link(CHAIN_KEY, null, canonicalOutboxEvent(unlinked)),
      },
    ],
  };
}

async function pushing(deviceSeq: number) {
  const { deviceToken } = await insertEnrolledInstallation(route.db, {
    now: NOW,
    outboxChainKey: CHAIN_KEY,
  });
  return route.app.inject({
    method: "POST",
    url: "/events",
    payload: pushOf(deviceSeq),
    headers: { authorization: `Bearer ${deviceToken}` },
  });
}

describe("POST /events queueing the application of what it receives", () => {
  it("queues the application once the events are received", async () => {
    enqueue.mockReset().mockResolvedValue(undefined);

    const response = await pushing(1);

    expect(response.statusCode).toBe(200);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("queues nothing for a push that stored no event", async () => {
    enqueue.mockReset().mockResolvedValue(undefined);

    const response = await pushing(5);

    expect(response.json()).toMatchObject({ status: "expected_seq" });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("stores no event when the application cannot be queued", async () => {
    enqueue.mockReset().mockRejectedValue(new Error("the job queue is down"));

    const response = await pushing(1);

    expect(response.statusCode).toBe(500);
    expect(await route.db.select().from(inbox)).toEqual([]);
  });
});
