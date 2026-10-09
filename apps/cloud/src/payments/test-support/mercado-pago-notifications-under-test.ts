import type { MercadoPagoOrders } from "@purosur/domain/payments/use-cases";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { registerRouteAccess } from "../../sessions/route-access.js";
import { buildTestDatabase, type TestDatabase } from "../../test-support/build-test-database.js";
import { registerMercadoPagoNotificationRoutes } from "../mercado-pago-notification-routes.js";
import { signatureHeader, WEBHOOK_SECRET } from "./mercado-pago-notification-signing.js";
import { FakeMercadoPagoOrders, NOW, ORDER_ID } from "./mercado-pago-qr-under-test.js";

export interface LoggedWarning {
  msg: string;
}

export interface NotificationRequest {
  dataId?: string;
  type?: string | undefined;
  signature?: string | undefined;
  requestId?: string;
  sourceAddress?: string;
  body?: object;
}

export interface MercadoPagoNotificationRoutesUnderTest {
  readonly db: TestDatabase["db"];
  readonly app: FastifyInstance;
  readonly mercadoPago: FakeMercadoPagoOrders;
  readonly warnings: LoggedWarning[];
  serveWith(configuration: {
    mercadoPago?: MercadoPagoOrders | undefined;
    webhookSecret?: string | undefined;
  }): Promise<void>;
  notify(request?: NotificationRequest): ReturnType<FastifyInstance["inject"]>;
}

export function mercadoPagoNotificationRoutesUnderTest(): MercadoPagoNotificationRoutesUnderTest {
  let testDatabase: TestDatabase;
  let app: FastifyInstance;
  let mercadoPago: FakeMercadoPagoOrders;
  let warnings: LoggedWarning[] = [];

  async function serve(configuration: {
    mercadoPago?: MercadoPagoOrders | undefined;
    webhookSecret?: string | undefined;
  }) {
    await app?.close();
    app = Fastify({
      logger: {
        level: "warn",
        stream: {
          write: (line: string) => {
            warnings.push(JSON.parse(line) as LoggedWarning);
          },
        },
      },
    });
    registerRouteAccess(app);
    registerMercadoPagoNotificationRoutes(app, {
      db: testDatabase.db,
      now: () => NOW,
      connections: { withConnection: (work) => work(testDatabase.db) },
      ...(configuration.mercadoPago ? { mercadoPago: configuration.mercadoPago } : {}),
      ...(configuration.webhookSecret ? { webhookSecret: configuration.webhookSecret } : {}),
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
    warnings = [];
    mercadoPago = new FakeMercadoPagoOrders();
    await serve({ mercadoPago, webhookSecret: WEBHOOK_SECRET });
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
    get warnings() {
      return warnings;
    },
    serveWith: serve,
    notify({
      dataId = ORDER_ID,
      type = "order",
      requestId = "request-1",
      signature = signatureHeader({ dataId, requestId }),
      sourceAddress = "203.0.113.50",
      body = { type: "order", data: { id: dataId } },
    }: NotificationRequest = {}) {
      const query = new URLSearchParams({ "data.id": dataId });
      if (type !== undefined) {
        query.set("type", type);
      }
      return app.inject({
        method: "POST",
        url: `/payments/mercado-pago/notifications?${query.toString()}`,
        payload: body,
        headers: {
          "x-real-ip": sourceAddress,
          "x-request-id": requestId,
          ...(signature !== undefined ? { "x-signature": signature } : {}),
        },
      });
    },
  };
}
