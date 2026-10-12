import { canonicalOutboxEvent, type JsonValue } from "@purosur/domain";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  categories,
  lots,
  products,
  stockBalances,
  stockMovements,
  users,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { applySyncedEventsTask } from "./apply-synced-events-task.js";
import { hmacEventChain } from "./hmac-event-chain.js";
import { eventsRouteUnderTest, NOW } from "./test-support/events-route.js";

const CHAIN_KEY = Buffer.alloc(32, 3).toString("base64");
const CASHIER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
const COUNT_ID = "6d1f7c3a-5b2e-4f8a-9c4d-1e2f3a4b5c6d";
const WITHDRAWAL_ID = "7e2a8d4b-6c3f-4a9b-8d5e-2f3a4b5c6d7e";

const route = eventsRouteUnderTest();

function pushOf(
  deviceSeq: number,
  previousHmac: string | null,
  event: { aggregateId: string; eventType: string; payload: { [member: string]: JsonValue } },
) {
  const unlinked = {
    event_id: crypto.randomUUID(),
    device_seq: deviceSeq,
    aggregate_type: "StockMovement",
    aggregate_id: event.aggregateId,
    event_type: event.eventType,
    schema_version: 1,
    payload: event.payload,
    occurred_at: "2026-10-06T11:00:00.000Z",
    actor_id: CASHIER,
  };
  const chain_hmac = hmacEventChain.link(CHAIN_KEY, previousHmac, canonicalOutboxEvent(unlinked));
  return {
    chain_hmac,
    body: {
      app_version: "1.4.0",
      telemetry: { wal_size_bytes: 4096, disk_free_bytes: 50_000_000, disk_free_ratio: 0.42 },
      events: [{ ...unlinked, chain_hmac }],
    },
  };
}

async function seededRegister() {
  const installation = await insertEnrolledInstallation(route.db, {
    now: NOW,
    outboxChainKey: CHAIN_KEY,
  });
  await route.db.insert(users).values({
    id: CASHIER,
    firstName: "Ada",
    email: "ada@example.com",
    locationId: installation.locationId,
  });
  const [category] = await route.db
    .insert(categories)
    .values({ name: "Almacen" })
    .returning({ id: categories.id });
  const [product] = await route.db
    .insert(products)
    .values({ name: "Yerba", categoryId: category?.id as string, saleUnit: "UNIT" })
    .returning({ id: products.id });
  return { ...installation, productId: product?.id as string };
}

describe("an opening count and its withdrawal pushed through POST /events", () => {
  it("creates the lot of the count once applied, and the withdrawal takes it back", async () => {
    const { deviceToken, locationId, productId } = await seededRegister();
    const push = (body: unknown) =>
      route.app.inject({
        method: "POST",
        url: "/events",
        payload: body as object,
        headers: { authorization: `Bearer ${deviceToken}` },
      });

    const count = pushOf(1, null, {
      aggregateId: COUNT_ID,
      eventType: "opening_count_recorded",
      payload: {
        movement_id: COUNT_ID,
        product_id: productId,
        counted: 6_000,
        expires_on: "2027-01-31",
      },
    });
    expect((await push(count.body)).json()).toMatchObject({ status: "ok", ack_seq: 1 });
    await applySyncedEventsTask(route.db, { now: () => NOW });

    expect(await route.db.select().from(lots)).toEqual([
      expect.objectContaining({
        productId,
        locationId,
        originMovementId: COUNT_ID,
        remaining: 6_000,
        withdrawn: false,
      }),
    ]);

    const withdrawal = pushOf(2, count.chain_hmac, {
      aggregateId: WITHDRAWAL_ID,
      eventType: "opening_count_withdrawn",
      payload: { movement_id: WITHDRAWAL_ID, withdrawn_movement_id: COUNT_ID },
    });
    expect((await push(withdrawal.body)).json()).toMatchObject({ status: "ok", ack_seq: 2 });
    await applySyncedEventsTask(route.db, { now: () => NOW });

    expect(await route.db.select().from(lots)).toEqual([
      expect.objectContaining({ remaining: 0, withdrawn: true }),
    ]);
    expect(
      await route.db.select().from(stockMovements).where(eq(stockMovements.id, WITHDRAWAL_ID)),
    ).toEqual([expect.objectContaining({ kind: "opening_count_withdrawal", delta: -6_000 })]);
    expect((await route.db.select().from(stockBalances))[0]?.quantity).toBe(0);
  });
});
