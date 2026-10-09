import type { MercadoPagoOrders } from "@purosur/domain/payments/use-cases";
import Fastify, { type FastifyInstance, type LightMyRequestResponse } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { registerRouteAccess } from "../../sessions/route-access.js";
import { buildTestDatabase, type TestDatabase } from "../../test-support/build-test-database.js";
import { registerMercadoPagoNotificationRoutes } from "../mercado-pago-notification-routes.js";
import { FakeMercadoPagoOrders, NOW, ORDER_ID } from "./fake-mercado-pago-orders.js";
import { signatureHeader, WEBHOOK_SECRET } from "./mercado-pago-notification-signing.js";

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
  notify(request?: NotificationRequest): Promise<LightMyRequestResponse>;
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
    notify(request: NotificationRequest = {}) {
      const dataId = request.dataId ?? ORDER_ID;
      const requestId = request.requestId ?? "request-1";
      const type = "type" in request ? request.type : "order";
      const signature =
        "signature" in request ? request.signature : signatureHeader({ dataId, requestId });
      const sourceAddress = request.sourceAddress ?? "203.0.113.50";
      const body = request.body ?? { type: "order", data: { id: dataId } };
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
