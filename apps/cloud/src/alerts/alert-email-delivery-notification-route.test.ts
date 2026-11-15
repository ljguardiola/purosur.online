import { cloudErrorSchema } from "@purosur/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  alertEmailDeliveryNotificationRouteUnderTest,
  notificationBody,
  PROVIDER_MESSAGE_ID,
  SIGNED_AT,
  signedHeaders,
  WEBHOOK_SECRET,
} from "./test-support/alert-email-delivery-notification-under-test.js";

const route = alertEmailDeliveryNotificationRouteUnderTest();

const BOUNCED = notificationBody("email.bounced", PROVIDER_MESSAGE_ID);

describe("POST /alerts/email-deliveries/notifications", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("when the provider or the webhook's signing secret is not configured", () => {
    it("answers that the provider is not configured without a signing secret", async () => {
      await route.serveWith({ statusQuery: route.statusQuery });
      const deliveryId = await route.sentDelivery();
      route.statusQuery.answer = { kind: "undelivered" };

      const response = await route.notify({ rawBody: BOUNCED });

      expect(response.statusCode).toBe(503);
      expect(cloudErrorSchema.parse(response.json()).code).toBe(
        "alert_email_provider_not_configured",
      );
      expect(route.statusQuery.queried).toEqual([]);
      expect(await route.deliveryOf(deliveryId)).toMatchObject({ status: "sent" });
    });

    it("answers that the provider is not configured without a way to query the provider", async () => {
      await route.serveWith({ webhookSecret: WEBHOOK_SECRET });

      const response = await route.notify({ rawBody: BOUNCED });

      expect(response.statusCode).toBe(503);
      expect(cloudErrorSchema.parse(response.json()).code).toBe(
        "alert_email_provider_not_configured",
      );
    });
  });

  describe("signature", () => {
    it.each([
      ["has no signature headers", {}, "missing_headers"],
      [
        "is signed with another secret",
        signedHeaders({ rawBody: BOUNCED, secret: "whsec_b3RoZXIgc2VjcmV0" }),
        "mismatch",
      ],
      [
        "is signed too long ago",
        signedHeaders({ rawBody: BOUNCED, timestamp: String(SIGNED_AT.getTime() / 1000 - 301) }),
        "stale_timestamp",
      ],
    ])(
      "discards and logs a notification that %s, asking the provider nothing and changing nothing",
      async (_case, headers, reason) => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const deliveryId = await route.sentDelivery();
        route.statusQuery.answer = { kind: "undelivered" };

        const response = await route.notify({ rawBody: BOUNCED, headers });

        expect(response.statusCode).toBe(401);
        expect(route.statusQuery.queried).toEqual([]);
        expect(await route.deliveryOf(deliveryId)).toMatchObject({ status: "sent", error: null });
        expect(warn).toHaveBeenCalledExactlyOnceWith(
          "discarded an alert email delivery notification with an invalid signature",
          { reason },
        );
      },
    );

    it("discards a notification whose body was altered after it was signed", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const deliveryId = await route.sentDelivery();
      route.statusQuery.answer = { kind: "undelivered" };

      const response = await route.notify({
        rawBody: notificationBody("email.bounced", PROVIDER_MESSAGE_ID),
        headers: signedHeaders({ rawBody: notificationBody("email.sent", PROVIDER_MESSAGE_ID) }),
      });

      expect(response.statusCode).toBe(401);
      expect(await route.deliveryOf(deliveryId)).toMatchObject({ status: "sent" });
    });

    it("verifies the body exactly as it was sent, whatever its spacing", async () => {
      const rawBody = `{ "type" : "email.bounced",\n  "data" : { "email_id" : "${PROVIDER_MESSAGE_ID}" } }`;
      const deliveryId = await route.sentDelivery();
      route.statusQuery.answer = { kind: "undelivered" };

      const response = await route.notify({ rawBody });

      expect(response.statusCode).toBe(200);
      expect(await route.deliveryOf(deliveryId)).toMatchObject({ status: "failed" });
    });

    it("reports a discarded notification once per reason without the body", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);

      await route.notify({ rawBody: BOUNCED, headers: {} });
      await route.notify({ rawBody: BOUNCED, headers: {} });

      expect(route.report).toHaveBeenCalledExactlyOnceWith(
        "alerts: discarded an alert email delivery notification with an invalid signature",
        expect.any(Error),
        { context: { reason: "missing_headers" } },
      );
    });

    it("logs nothing of the body of a discarded notification", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      await route.notify({ rawBody: BOUNCED, headers: {} });

      expect(JSON.stringify(warn.mock.calls)).not.toContain(PROVIDER_MESSAGE_ID);
    });
  });

  describe("a validly signed notification", () => {
    it("asks the provider for the status of the email it names and fails the delivery when the provider could not deliver it", async () => {
      const deliveryId = await route.sentDelivery();
      route.statusQuery.answer = { kind: "undelivered" };

      const response = await route.notify({ rawBody: BOUNCED });

      expect(response.statusCode).toBe(200);
      expect(route.statusQuery.queried).toEqual([PROVIDER_MESSAGE_ID]);
      expect(await route.deliveryOf(deliveryId)).toEqual({
        status: "failed",
        error: "provider_undelivered",
      });
    });

    it("applies what the provider answers even when the notification says the email was delivered", async () => {
      const deliveryId = await route.sentDelivery();
      route.statusQuery.answer = { kind: "undelivered" };

      const response = await route.notify({
        rawBody: notificationBody("email.delivered", PROVIDER_MESSAGE_ID),
      });

      expect(response.statusCode).toBe(200);
      expect(await route.deliveryOf(deliveryId)).toMatchObject({ status: "failed" });
    });

    it.each([
      ["delivered", { kind: "delivered" }],
      ["still in transit", { kind: "in_transit" }],
    ] as const)(
      "leaves the delivery sent when the provider answers it is %s, even if the notification says it bounced",
      async (_case, answer) => {
        const deliveryId = await route.sentDelivery();
        route.statusQuery.answer = answer;

        const response = await route.notify({ rawBody: BOUNCED });

        expect(response.statusCode).toBe(200);
        expect(await route.deliveryOf(deliveryId)).toEqual({ status: "sent", error: null });
      },
    );

    it("acknowledges the notification of an email that is not an alert email without asking the provider", async () => {
      const deliveryId = await route.sentDelivery();

      const response = await route.notify({
        rawBody: notificationBody("email.bounced", "an-access-email-id"),
      });

      expect(response.statusCode).toBe(200);
      expect(route.statusQuery.queried).toEqual([]);
      expect(await route.deliveryOf(deliveryId)).toMatchObject({ status: "sent" });
    });

    it.each([
      ["an event that is not about an email", notificationBody("domain.updated", "x")],
      ["an email event with no email id", notificationBody("email.bounced", undefined)],
      [
        "an email event whose email id is not text",
        JSON.stringify({ type: "email.bounced", data: { email_id: 7 } }),
      ],
      ["a body that is not JSON", "not json"],
      ["a body that is not an object", "null"],
    ])("acknowledges %s without asking the provider", async (_case, rawBody) => {
      const response = await route.notify({ rawBody });

      expect(response.statusCode).toBe(200);
      expect(route.statusQuery.queried).toEqual([]);
    });

    it("answers that the provider is unavailable, to be sent again, when the provider cannot be asked", async () => {
      const deliveryId = await route.sentDelivery();
      route.statusQuery.answer = { kind: "unavailable" };

      const response = await route.notify({ rawBody: BOUNCED });

      expect(response.statusCode).toBe(503);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("alert_email_provider_unavailable");
      expect(await route.deliveryOf(deliveryId)).toMatchObject({ status: "sent", error: null });
    });
  });
});
