import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { registerRouteAccess } from "../../sessions/route-access.js";
import { buildTestDatabase, type TestDatabase } from "../../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../../test-support/installation-keys-encryption-key.js";
import { registerPaidOrdersOfRegisterRoutes } from "../paid-orders-of-register-routes.js";
import { NOW } from "./fake-mercado-pago-orders.js";

export interface PaidOrdersOfRegisterRoutesUnderTest {
  readonly db: TestDatabase["db"];
  readonly app: FastifyInstance;
}

export function paidOrdersOfRegisterRoutesUnderTest(): PaidOrdersOfRegisterRoutesUnderTest {
  let testDatabase: TestDatabase;
  let app: FastifyInstance;

  beforeAll(async () => {
    testDatabase = await buildTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.close();
  });

  beforeEach(async () => {
    await testDatabase.clear();
    app = Fastify();
    registerRouteAccess(app);
    registerPaidOrdersOfRegisterRoutes(app, {
      db: testDatabase.db,
      rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
      keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
      now: () => NOW,
      connections: { withConnection: (work) => work(testDatabase.db) },
    });
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
  };
}
