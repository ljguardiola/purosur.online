import type { MercadoPagoOrders } from "@purosur/domain/payments/use-cases";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { registerRouteAccess } from "../../sessions/route-access.js";
import { buildTestDatabase, type TestDatabase } from "../../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../../test-support/installation-keys-encryption-key.js";
import { registerMercadoPagoQrRoutes } from "../mercado-pago-qr-routes.js";
import { FakeMercadoPagoOrders, NOW } from "./fake-mercado-pago-orders.js";

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
