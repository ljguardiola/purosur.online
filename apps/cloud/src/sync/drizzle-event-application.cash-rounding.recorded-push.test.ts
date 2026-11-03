import { syncedEventUpcaster } from "@purosur/contracts";
import { recordedPushes } from "@purosur/contracts/sync/test-support";
import { applyPendingEvents } from "@purosur/domain/sync/use-cases";
import { isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { categories, inbox, products, sales, users } from "../platform/db/schema.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { eventApplicationUnderTest } from "./test-support/drizzle-event-application.js";

const system = eventApplicationUnderTest();

const RECORDING = "sales-with-cash-rounding.json";
const CASHIER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";

function recordedPush() {
  const found = recordedPushes().find((recorded) => recorded.name === RECORDING);
  if (!found) {
    throw new Error(`test setup: ${RECORDING} is not recorded`);
  }
  return found;
}

describe("applying the push of a register that rounded what was paid in cash", () => {
  it("keeps the rounding of each sale, apart from its discount on the total, and of the voided one too", async () => {
    const { deviceId, locationId } = await system.enrollInstallation();
    await system.db
      .insert(users)
      .values({ id: CASHIER, firstName: "Ada", email: "ada@example.com", locationId });
    const [category] = await system.db
      .insert(categories)
      .values({ name: "Almacen" })
      .returning({ id: categories.id });
    const events = recordedPush().push.events.filter((event) =>
      ["cash_session_opened", "sale_completed", "sale_voided"].includes(event.event_type),
    );
    const productIds = new Set(
      events.flatMap((event) =>
        event.event_type === "sale_completed"
          ? (event.payload as { lines: { product_id: string }[] }).lines.map(
              (line) => line.product_id,
            )
          : [],
      ),
    );
    await system.db.insert(products).values(
      [...productIds].map((id) => ({
        id,
        name: `Producto ${id}`,
        categoryId: category?.id as string,
        saleUnit: "UNIT" as const,
      })),
    );
    await system.db.insert(inbox).values(
      events.map((event) => ({
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

    const unapplied = await system.db
      .select({ eventType: inbox.eventType, lastError: inbox.lastError })
      .from(inbox)
      .where(isNull(inbox.appliedAt));
    expect(unapplied).toEqual([]);
    expect(outcome).toMatchObject({ kind: "processed", retried: 0 });
    const rows = await system.db.select().from(sales);
    expect(
      rows
        .map(({ state, total, cashRounding, saleDiscountAmount }) => ({
          state,
          total,
          cashRounding,
          saleDiscountAmount,
        }))
        .sort((a, b) => b.total - a.total),
    ).toEqual([
      { state: "COMPLETED", total: 320000, cashRounding: 7000, saleDiscountAmount: null },
      { state: "VOIDED", total: 85000, cashRounding: 4500, saleDiscountAmount: null },
      { state: "COMPLETED", total: 40000, cashRounding: 3000, saleDiscountAmount: 5000 },
    ]);
  });
});
