import type {
  MercadoPagoOrderCreation,
  MercadoPagoOrderReading,
  MercadoPagoOrders,
  MercadoPagoQrOrderRequest,
} from "@purosur/domain/payments/use-cases";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { registerRouteAccess } from "../../sessions/route-access.js";
import { buildTestDatabase, type TestDatabase } from "../../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../../test-support/installation-keys-encryption-key.js";
import { registerMercadoPagoQrRoutes } from "../mercado-pago-qr-routes.js";

export const NOW = new Date("2026-10-09T12:00:00.000Z");
export const ORDER_ID = "ORD01JQ4S4KY8HWQ6NA5PXB65B3D3";

export const UNPAID_ORDER = {
  status: "created",
  statusDetail: "created",
  totalPaidAmount: null,
  payments: [{ status: "created", statusDetail: "ready_to_process", paidAmount: null }],
} as const;

export const PAID_ORDER = {
  status: "processed",
  statusDetail: "accredited",
  totalPaidAmount: 5000,
  payments: [{ status: "processed", statusDetail: "accredited", paidAmount: 5000 }],
} as const;

export class FakeMercadoPagoOrders implements MercadoPagoOrders {
  readonly longestCallMs = 10_000;
  readonly creations: MercadoPagoQrOrderRequest[] = [];
  readonly readings: string[] = [];
  creation: MercadoPagoOrderCreation = { kind: "created", orderId: ORDER_ID, result: UNPAID_ORDER };
  reading: MercadoPagoOrderReading = { kind: "read", result: UNPAID_ORDER };

  async createQrOrder(request: MercadoPagoQrOrderRequest): Promise<MercadoPagoOrderCreation> {
    this.creations.push(request);
    return this.creation;
  }

  async readOrder(orderId: string): Promise<MercadoPagoOrderReading> {
    this.readings.push(orderId);
    return this.reading;
  }
}

export interface MercadoPagoQrRoutesUnderTest {
  readonly db: TestDatabase["db"];
  readonly app: FastifyInstance;
  readonly mercadoPago: FakeMercadoPagoOrders;
  serveWith(mercadoPago: MercadoPagoOrders | undefined): Promise<void>;
}

export function mercadoPagoQrRoutesUnderTest(): MercadoPagoQrRoutesUnderTest {
  let testDatabase: TestDatabase;
  let app: FastifyInstance;
  let mercadoPago: FakeMercadoPagoOrders;

  async function serve(orders: MercadoPagoOrders | undefined) {
    await app?.close();
    app = Fastify();
    registerRouteAccess(app);
    registerMercadoPagoQrRoutes(app, {
      db: testDatabase.db,
      rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
      keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
      now: () => NOW,
      connections: { withConnection: (work) => work(testDatabase.db) },
      ...(orders ? { mercadoPago: orders } : {}),
    });
  }

  beforeAll(async () => {
    testDatabase = await buildTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.close();
  });

  beforeEach(async () => {
    await testDatabase.clear();
    mercadoPago = new FakeMercadoPagoOrders();
    await serve(mercadoPago);
  });

  afterEach(async () => {
    await app.close();
  });

  return {
    get db() {
      return testDatabase.db;
    },
    get app() {
      return app;
    },
    get mercadoPago() {
      return mercadoPago;
    },
    serveWith: serve,
  };
}
