import { syncedEventUpcaster } from "@purosur/contracts";
import { recordedPushes } from "@purosur/contracts/sync/test-support";
import { applyPendingEvents } from "@purosur/domain/sync/use-cases";
import { describe, expect, it } from "vitest";
import { pendingTransaction } from "../payments/test-support/payment-transaction-fixtures.js";
import {
  categories,
  inbox,
  paymentRefunds,
  paymentTransactions,
  products,
  sales,
  users,
} from "../platform/db/schema.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { eventApplicationUnderTest } from "./test-support/drizzle-event-application.js";

const system = eventApplicationUnderTest();

const RECORDING = "sales-rebuilt-against-paid-orders.json";
const COMPLETED_ORDER = "0199b7a0-0000-7000-8000-000000000c01";
const CANCELLED_ORDER = "0199b7a0-0000-7000-8000-000000000c02";
const CASHIER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
const SOLD_PRODUCT = "5d1a8f3c-9e47-4b02-8c6d-7a3f2e9b1c06";

function recordedPush() {
  const found = recordedPushes().find((recorded) => recorded.name === RECORDING);
  if (!found) {
    throw new Error(`test setup: ${RECORDING} is not recorded`);
  }
  return found;
}

describe("applying the push of a register that rebuilt sales against paid orders", () => {
  it("applies each rebuilt sale against the order that backs it and opens the refund of the surplus", async () => {
    const { deviceId, locationId, registerId } = await system.enrollInstallation();
    await system.db
      .insert(users)
      .values({ id: CASHIER, firstName: "Ada", email: "ada@example.com", locationId });
    const [category] = await system.db
      .insert(categories)
      .values({ name: "Almacen" })
      .returning({ id: categories.id });
    await system.db.insert(products).values({
      id: SOLD_PRODUCT,
      name: "Azucar",
      categoryId: category?.id as string,
      saleUnit: "UNIT",
    });
    await system.db.insert(paymentTransactions).values([
      pendingTransaction(registerId, { id: COMPLETED_ORDER, amount: 3000, state: "APPROVED" }),
      pendingTransaction(registerId, { id: CANCELLED_ORDER, amount: 1000, state: "APPROVED" }),
    ]);
    const rebuilt = recordedPush().push.events.filter((event) =>
      [COMPLETED_ORDER, CANCELLED_ORDER].some((order) =>
        JSON.stringify(event.payload).includes(order),
      ),
    );
    const sessions = recordedPush().push.events.filter(
      (event) => event.event_type === "cash_session_opened",
    );
    await system.db.insert(inbox).values(
      [...sessions, ...rebuilt].map((event) => ({
        eventId: event.event_id,
        deviceId,
        deviceSeq: event.device_seq,
        aggregateType: event.aggregate_type,
        aggregateId: event.aggregate_id,
        eventType: event.event_type,
        schemaVersion: event.schema_version,
        payload: event.payload,
        occurredAt: new Date(event.occurred_at),
        actorId: event.actor_id,
        chainHmac: event.chain_hmac,
        receivedAt: new Date(event.occurred_at),
      })),
    );

    const outcome = await applyPendingEvents(
      {
        zoneRules: fixedZoneRulesSource(),
        eventApplication: system.application,
        upcaster: syncedEventUpcaster,
        clock: { now: () => new Date("2026-10-06T15:00:00.000Z") },
        quarantineNotices: { quarantined: () => {} },
      },
      { limit: 20 },
    );

    expect(outcome).toMatchObject({ kind: "processed", retried: 0 });
    expect((await system.db.select().from(sales)).map(({ state }) => state).sort()).toEqual([
      "CANCELLED",
      "COMPLETED",
    ]);
    const refunds = await system.db.select().from(paymentRefunds);
    expect(
      refunds
        .map(({ origin, paymentTransactionId, amount }) => ({ origin, paymentTransactionId, amount }))
        .sort((a, b) => a.amount - b.amount),
    ).toEqual([
      { origin: "sale_cancelled", paymentTransactionId: CANCELLED_ORDER, amount: 1000 },
      { origin: "late_payment", paymentTransactionId: COMPLETED_ORDER, amount: 600 },
    ]);
  });
});
