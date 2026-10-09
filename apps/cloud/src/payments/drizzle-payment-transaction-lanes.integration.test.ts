import {
  createMercadoPagoQrOrder,
  type MercadoPagoOrderCreation,
  type MercadoPagoOrderReading,
  type MercadoPagoOrders,
  type MercadoPagoQrOrderPorts,
  type MercadoPagoQrOrderRequest,
} from "@purosur/domain/payments/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { postgresDedicatedConnections } from "../platform/dedicated-connections.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { DrizzlePaymentTransactionLanes } from "./drizzle-payment-transaction-lanes.js";
import { CREATED_AT, insertRegister } from "./test-support/payment-transaction-fixtures.js";

const UNPAID_ORDER = {
  status: "created",
  statusDetail: "created",
  totalAmount: 5000,
  totalPaidAmount: null,
  payments: [],
} as const;

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("payment_transaction_lanes");
  sql = postgres(integrationDb.databaseUrl, { max: 8 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

class HeldMercadoPago implements MercadoPagoOrders {
  readonly started: string[] = [];
  readonly finished: string[] = [];
  private readonly releases = new Map<string, (outcome: MercadoPagoOrderCreation | Error) => void>();

  createQrOrder({ externalReference }: MercadoPagoQrOrderRequest): Promise<MercadoPagoOrderCreation> {
    this.started.push(externalReference);
    return new Promise((resolve, reject) => {
      this.releases.set(externalReference, (outcome) => {
        this.finished.push(externalReference);
        if (outcome instanceof Error) {
          reject(outcome);
        } else {
          resolve(outcome);
        }
      });
    });
  }

  async readOrder(): Promise<MercadoPagoOrderReading> {
    return { kind: "read", result: UNPAID_ORDER };
  }

  release(
    externalReference: string,
    outcome: MercadoPagoOrderCreation | Error = {
      kind: "created",
      orderId: `ORD-${externalReference}`,
      result: UNPAID_ORDER,
    },
  ): void {
    this.releases.get(externalReference)?.(outcome);
  }

  async untilStarted(count: number): Promise<void> {
    await vi.waitFor(() => expect(this.started.length).toBeGreaterThanOrEqual(count));
  }
}

function portsOf(mercadoPago: MercadoPagoOrders): MercadoPagoQrOrderPorts {
  return {
    lanes: new DrizzlePaymentTransactionLanes(postgresDedicatedConnections(sql)),
    mercadoPago,
    clock: { now: () => CREATED_AT },
  };
}

function create(ports: MercadoPagoQrOrderPorts, registerId: string, paymentTransactionId: string) {
  return createMercadoPagoQrOrder(ports, {
    registerId,
    paymentTransactionId,
    saleId: "00000000-0000-4000-8000-000000000001",
    amount: 5000,
  });
}

function storedRows() {
  return sql<{ id: string; provider_order_id: string | null; state_read_at: Date | null }[]>`
    select id, provider_order_id, state_read_at from payment_transactions`;
}

describe("the payment transaction lanes on a real Postgres", () => {
  it("keeps the transaction committed and visible to other connections while the provider is being called, and records the order and the read after it", async () => {
    const registerId = await insertRegister(db, "caja-visible");
    const id = crypto.randomUUID();
    const mercadoPago = new HeldMercadoPago();

    const outcome = create(portsOf(mercadoPago), registerId, id);
    await mercadoPago.untilStarted(1);

    expect(await storedRows()).toEqual([{ id, provider_order_id: null, state_read_at: null }]);

    mercadoPago.release(id);
    await outcome;
    expect(await storedRows()).toEqual([
      { id, provider_order_id: `ORD-${id}`, state_read_at: CREATED_AT },
    ]);
  });

  it("leaves the transaction without an order when the provider call breaks", async () => {
    const registerId = await insertRegister(db, "caja-call-broken");
    const id = crypto.randomUUID();
    const mercadoPago = new HeldMercadoPago();

    const outcome = create(portsOf(mercadoPago), registerId, id);
    await mercadoPago.untilStarted(1);
    mercadoPago.release(id, new Error("the connection broke"));

    await expect(outcome).rejects.toThrow("the connection broke");
    expect((await storedRows()).filter((row) => row.id === id)).toEqual([
      { id, provider_order_id: null, state_read_at: null },
    ]);
  });

  it("calls the provider once for a transaction asked for twice at the same time, and serves the second ask after the first", async () => {
    const registerId = await insertRegister(db, "caja-serial");
    const id = crypto.randomUUID();
    const mercadoPago = new HeldMercadoPago();
    const ports = portsOf(mercadoPago);

    const first = create(ports, registerId, id);
    await mercadoPago.untilStarted(1);
    const second = create(ports, registerId, id);
    await waitForLockWaiters(sql, 1);

    expect(mercadoPago.started).toEqual([id]);

    mercadoPago.release(id);
    await first;
    const secondOutcome = await second;

    expect(mercadoPago.started).toEqual([id]);
    expect(secondOutcome).toMatchObject({
      kind: "recorded",
      transaction: { id, providerOrderId: `ORD-${id}` },
    });
  });

  it("lets calls for different transactions be in flight together", async () => {
    const registerId = await insertRegister(db, "caja-parallel");
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    const mercadoPago = new HeldMercadoPago();
    const ports = portsOf(mercadoPago);

    const first = create(ports, registerId, firstId);
    const second = create(ports, registerId, secondId);
    await mercadoPago.untilStarted(2);

    expect(mercadoPago.finished).toEqual([]);

    mercadoPago.release(firstId);
    mercadoPago.release(secondId);
    await Promise.all([first, second]);
  });

  it("frees the transaction when the provider call breaks, so the next ask is served", async () => {
    const registerId = await insertRegister(db, "caja-broken");
    const id = crypto.randomUUID();
    const mercadoPago = new HeldMercadoPago();
    const ports = portsOf(mercadoPago);

    const broken = create(ports, registerId, id);
    await mercadoPago.untilStarted(1);
    const next = create(ports, registerId, id);
    await waitForLockWaiters(sql, 1);
    mercadoPago.release(id, new Error("the connection broke"));
    await expect(broken).rejects.toThrow("the connection broke");

    await mercadoPago.untilStarted(2);
    mercadoPago.release(id);
    await expect(next).resolves.toMatchObject({ kind: "recorded" });
  });
});
