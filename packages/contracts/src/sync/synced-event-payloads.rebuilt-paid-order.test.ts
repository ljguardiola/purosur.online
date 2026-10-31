import { describe, expect, it } from "vitest";
import {
  READABLE_EVENT_VERSIONS,
  syncedEventPayloadKey,
  syncedEventPayloadSchema,
} from "./synced-event-payloads.js";
import { recordedEvents } from "./test-support/recorded-pushes.js";

type Payload = Record<string, unknown>;

const PAID_ORDER = "0199b7a0-0000-7000-8000-000000000b01";

function recordedSale(schemaVersion: number): Payload {
  const matching = recordedEvents().filter(
    (event) => event.event_type === "sale_completed" && event.schema_version === schemaVersion,
  );
  return structuredClone(matching[0]?.["payload"] as Payload);
}

function accepts(schemaVersion: number, payload: unknown): boolean {
  const key = syncedEventPayloadKey("sale_completed", schemaVersion);
  return key !== undefined && syncedEventPayloadSchema(key).safeParse(payload).success;
}

function version10(rebuilt: unknown): Payload {
  return { ...recordedSale(9), rebuilt_paid_order: rebuilt };
}

describe("sale_completed version 10", () => {
  it("is a readable version", () => {
    expect(READABLE_EVENT_VERSIONS).toContain("sale_completed@10");
  });

  it("accepts a sale that was not rebuilt against a paid order", () => {
    expect(accepts(10, version10(null))).toBe(true);
  });

  it.each([0, 1, 3_100])(
    "accepts a sale rebuilt against a paid order with a surplus of %s",
    (surplus) => {
      expect(accepts(10, version10({ payment_transaction_id: PAID_ORDER, surplus }))).toBe(true);
    },
  );

  it("refuses a sale that does not say whether it was rebuilt", () => {
    expect(accepts(10, recordedSale(9))).toBe(false);
  });

  it.each([
    ["a negative surplus", { payment_transaction_id: PAID_ORDER, surplus: -1 }],
    ["a fractional surplus", { payment_transaction_id: PAID_ORDER, surplus: 10.5 }],
    ["a surplus given as text", { payment_transaction_id: PAID_ORDER, surplus: "10" }],
    ["no surplus", { payment_transaction_id: PAID_ORDER }],
    ["no paid order", { surplus: 0 }],
    ["an empty paid order id", { payment_transaction_id: "", surplus: 0 }],
  ])("refuses %s", (_case, rebuilt) => {
    expect(accepts(10, version10(rebuilt))).toBe(false);
  });

  it("still holds the rest of a version 9 sale to its rules", () => {
    expect(accepts(10, { ...version10(null), payments: [] })).toBe(false);
  });

  it("keeps accepting a recorded version 9 sale exactly as it was", () => {
    expect(accepts(9, recordedSale(9))).toBe(true);
  });
});
