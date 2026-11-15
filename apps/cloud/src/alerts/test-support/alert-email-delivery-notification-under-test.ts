import { createHmac } from "node:crypto";
import type {
  AlertEmailStatusQuery,
  QueriedAlertEmailStatus,
} from "@purosur/domain/alerts/use-cases";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance, type LightMyRequestResponse } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, type Mock, vi } from "vitest";
import { alertEmailDeliveries, alerts, users } from "../../platform/db/schema.js";
import type { reportError } from "../../platform/error-reporting.js";
import { registerRouteAccess } from "../../sessions/route-access.js";
import { buildTestDatabase, type TestDatabase } from "../../test-support/build-test-database.js";
import { seededLocationId } from "../../test-support/seeded-location.js";
import { registerAlertEmailDeliveryNotificationRoute } from "../alert-email-delivery-notification-route.js";

export const WEBHOOK_SECRET = `whsec_${Buffer.from("test-only-resend-webhook-secret").toString("base64")}`;
export const SIGNED_AT = new Date("2026-10-01T12:00:00.000Z");
export const PROVIDER_MESSAGE_ID = "4ef9a417-02e9-4d39-ad75-9611e0fcc33c";

export class FakeAlertEmailStatusQuery implements AlertEmailStatusQuery {
  readonly queried: string[] = [];
  answer: QueriedAlertEmailStatus = { kind: "in_transit" };

  async queriedAlertEmailStatus(providerMessageId: string): Promise<QueriedAlertEmailStatus> {
    this.queried.push(providerMessageId);
    return this.answer;
  }
}

export interface SignedNotification {
  rawBody: string;
  id?: string;
  timestamp?: string;
  secret?: string;
}

export function signedHeaders({
  rawBody,
  id = "msg_2ZnGfl0nQ1k0dYJmP7x6bKq3Vh4",
  timestamp = String(SIGNED_AT.getTime() / 1000),
  secret = WEBHOOK_SECRET,
}: SignedNotification): Record<string, string> {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const digest = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
  return { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${digest}` };
}

export function notificationBody(type: string, emailId: string | undefined): string {
  return JSON.stringify({
    type,
    created_at: "2026-10-01T11:59:00.000Z",
    data: { ...(emailId === undefined ? {} : { email_id: emailId }), subject: "Alerta" },
  });
}

export interface AlertEmailDeliveryNotificationRouteUnderTest {
  readonly db: TestDatabase["db"];
  readonly statusQuery: FakeAlertEmailStatusQuery;
  readonly report: Mock<typeof reportError>;
  serveWith(configuration: {
    statusQuery?: AlertEmailStatusQuery | undefined;
    webhookSecret?: string | undefined;
  }): Promise<void>;
  sentDelivery(): Promise<string>;
  deliveryOf(deliveryId: string): Promise<{ status: string; error: string | null }>;
  notify(request: {
    rawBody: string;
    headers?: Record<string, string>;
    contentType?: string;
  }): Promise<LightMyRequestResponse>;
}

export function alertEmailDeliveryNotificationRouteUnderTest(): AlertEmailDeliveryNotificationRouteUnderTest {
  let testDatabase: TestDatabase;
  let app: FastifyInstance;
  let statusQuery: FakeAlertEmailStatusQuery;
  let report: Mock<typeof reportError>;

  async function serve(configuration: {
    statusQuery?: AlertEmailStatusQuery | undefined;
    webhookSecret?: string | undefined;
  }) {
    await app?.close();
    app = Fastify();
    registerRouteAccess(app);
    registerAlertEmailDeliveryNotificationRoute(app, {
      db: testDatabase.db,
      now: () => SIGNED_AT,
      report,
      ...(configuration.statusQuery ? { statusQuery: configuration.statusQuery } : {}),
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
    statusQuery = new FakeAlertEmailStatusQuery();
    report = vi.fn<typeof reportError>();
    await serve({ statusQuery, webhookSecret: WEBHOOK_SECRET });
  });

  afterEach(async () => {
    await app.close();
  });

  return {
    get db() {
      return testDatabase.db;
    },
    get statusQuery() {
      return statusQuery;
    },
    get report() {
      return report;
    },
    serveWith: serve,
    async sentDelivery() {
      const { db } = testDatabase;
      const [recipient] = await db
        .insert(users)
        .values({
          firstName: "Ada",
          email: "ada@example.com",
          locationId: await seededLocationId(db),
        })
        .returning({ id: users.id });
      const [alert] = await db
        .insert(alerts)
        .values({
          kind: "backoffice_passkey_changed",
          scope: "user-1",
          level: "warning",
          audience: "all",
          detail: {},
          openedAt: SIGNED_AT,
        })
        .returning({ id: alerts.id });
      const [delivery] = await db
        .insert(alertEmailDeliveries)
        .values({
          alertId: alert?.id ?? "",
          recipientUserId: recipient?.id ?? "",
          stage: "opened",
          level: "warning",
          occurredAt: SIGNED_AT,
          status: "sent",
          sentAt: SIGNED_AT,
          providerMessageId: PROVIDER_MESSAGE_ID,
        })
        .returning({ id: alertEmailDeliveries.id });
      if (!delivery) {
        throw new Error("test setup: inserting the delivery returned no row");
      }
      return delivery.id;
    },
    async deliveryOf(deliveryId) {
      const [row] = await testDatabase.db
        .select({ status: alertEmailDeliveries.status, error: alertEmailDeliveries.error })
        .from(alertEmailDeliveries)
        .where(eq(alertEmailDeliveries.id, deliveryId));
      if (!row) {
        throw new Error("test setup: the delivery is gone");
      }
      return row;
    },
    notify({ rawBody, headers = signedHeaders({ rawBody }), contentType = "application/json" }) {
      return app.inject({
        method: "POST",
        url: "/alerts/email-deliveries/notifications",
        payload: rawBody,
        headers: { "content-type": contentType, ...headers },
      });
    },
  };
}
