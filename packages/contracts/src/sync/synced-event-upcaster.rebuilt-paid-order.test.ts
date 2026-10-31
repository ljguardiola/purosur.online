import type { PushedEvent } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { syncedEventUpcaster } from "./synced-event-upcaster.js";
import { recordedPushes } from "./test-support/recorded-pushes.js";
import { unappliedEventOf } from "./test-support/unapplied-event.js";

const RECORDED_SALES = recordedPushes()
  .flatMap(({ push }) => push.events)
  .filter((event) => event.event_type === "sale_completed");

const PAID_ORDER = "0199b7a0-0000-7000-8000-000000000b01";

function version10Sale(
  rebuilt: { payment_transaction_id: string; surplus: number } | null,
): PushedEvent {
  const recorded = RECORDED_SALES.find((event) => event.schema_version === 9) as PushedEvent;
  return {
    ...recorded,
    schema_version: 10,
    payload: { ...recorded.payload, rebuilt_paid_order: rebuilt },
  };
}

describe("decoding a completed sale for the paid order it was rebuilt against", () => {
  it.each(
    RECORDED_SALES.map((event): [string, PushedEvent] => [`v${event.schema_version}`, event]),
  )("reads a recorded %s sale as one rebuilt against no paid order", (_version, event) => {
    expect(syncedEventUpcaster.decode(unappliedEventOf(event))).toMatchObject({
      kind: "fact",
      fact: { kind: "sale_completed", sale: { rebuiltPaidOrder: null } },
    });
  });

  it("reads a version 10 sale that was not rebuilt as one rebuilt against no paid order", () => {
    expect(syncedEventUpcaster.decode(unappliedEventOf(version10Sale(null)))).toMatchObject({
      kind: "fact",
      fact: { kind: "sale_completed", sale: { rebuiltPaidOrder: null } },
    });
  });

  it("reads the paid order and the surplus a version 10 sale names", () => {
    const decoded = syncedEventUpcaster.decode(
      unappliedEventOf(version10Sale({ payment_transaction_id: PAID_ORDER, surplus: 3_100 })),
    );

    expect(decoded).toMatchObject({
      kind: "fact",
      fact: {
        kind: "sale_completed",
        sale: { rebuiltPaidOrder: { paymentTransactionId: PAID_ORDER, surplus: 3_100 } },
      },
    });
  });
});
