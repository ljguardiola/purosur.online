import { cloudErrorSchema } from "@purosur/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  alertEmailDeliveryNotificationRouteUnderTest,
  notificationBody,
  PROVIDER_MESSAGE_ID,
  signedHeaders,
  WEBHOOK_SECRET,
} from "./test-support/alert-email-delivery-notification-under-test.js";

const route = alertEmailDeliveryNotificationRouteUnderTest();

const BOUNCED = notificationBody("email.bounced", PROVIDER_MESSAGE_ID);

function providerAnswers(status: string, alertDeliveryId: string | null = null) {
  route.statusQuery.answer = { kind: "answered", status, alertDeliveryId };
}

describe("POST /alerts/email-deliveries/notifications", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("when the provider or the webhook's signing secret is not configured", () => {
    it("answers that the provider is not configured without a signing secret", async () => {
      await route.serveWith({ statusQuery: route.statusQuery });
      const deliveryId = await route.sentDelivery();
      providerAnswers("bounced");

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
    it("discards, logs and reports a notification whose signature does not validate, asking the provider nothing and changing nothing", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const deliveryId = await route.sentDelivery();
      providerAnswers("bounced");

      const response = await route.notify({
        rawBody: BOUNCED,
        headers: signedHeaders({ rawBody: BOUNCED, secret: "whsec_b3RoZXIgc2VjcmV0" }),
      });

      expect(response.statusCode).toBe(401);
      expect(route.statusQuery.queried).toEqual([]);
      expect(await route.deliveryOf(deliveryId)).toMatchObject({ status: "sent", error: null });
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        "discarded an alert email delivery notification with an invalid signature",
        { reason: "mismatch" },
      );
      expect(route.report).toHaveBeenCalledExactlyOnceWith(
        "alerts: discarded an alert email delivery notification with an invalid signature",
        expect.any(Error),
        { context: { reason: "mismatch" } },
      );
    });

    it("verifies the body exactly as it was sent, whatever its spacing", async () => {
      const rawBody = `{ "type" : "email.bounced",\n  "data" : { "email_id" : "${PROVIDER_MESSAGE_ID}" } }`;
      const deliveryId = await route.sentDelivery();
      providerAnswers("bounced");

      const response = await route.notify({ rawBody });

      expect(response.statusCode).toBe(200);
      expect(await route.deliveryOf(deliveryId)).toMatchObject({ status: "failed" });
    });
  });

  describe("a validly signed notification", () => {
    it("asks the provider for the status of the email it names and fails the delivery when the provider could not deliver it", async () => {
      const deliveryId = await route.sentDelivery();
      providerAnswers("bounced");

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
      providerAnswers("bounced");

      const response = await route.notify({
        rawBody: notificationBody("email.delivered", PROVIDER_MESSAGE_ID),
      });

      expect(response.statusCode).toBe(200);
      expect(await route.deliveryOf(deliveryId)).toMatchObject({ status: "failed" });
    });

    it.each(["delivered", "queued"])(
      "leaves the delivery sent when the provider answers it is %s, even if the notification says it bounced",
      async (status) => {
        const deliveryId = await route.sentDelivery();
        providerAnswers(status);

        const response = await route.notify({ rawBody: BOUNCED });

        expect(response.statusCode).toBe(200);
        expect(await route.deliveryOf(deliveryId)).toEqual({ status: "sent", error: null });
      },
    );

    it("acknowledges the notification of an email no delivery sent without asking the provider, even when the provider cannot be asked", async () => {
      const deliveryId = await route.sentDelivery();
      route.statusQuery.answer = { kind: "unavailable" };

      const response = await route.notify({
        rawBody: notificationBody("email.bounced", "an-access-email-id"),
      });

      expect(response.statusCode).toBe(200);
      expect(route.statusQuery.queried).toEqual([]);
      expect(await route.deliveryOf(deliveryId)).toMatchObject({ status: "sent" });
    });

    it("answers that the email's sending is not yet recorded, to be sent again, when the provider holds it as a pending delivery's", async () => {
      const deliveryId = await route.pendingDelivery();
      providerAnswers("bounced", deliveryId);

      const response = await route.notify({ rawBody: BOUNCED });

      expect(response.statusCode).toBe(503);
      expect(cloudErrorSchema.parse(response.json()).code).toBe(
        "alert_email_send_not_yet_recorded",
      );
      expect(await route.deliveryOf(deliveryId)).toEqual({ status: "pending", error: null });
    });

    it("acknowledges an event that is not about an email without asking the provider", async () => {
      const response = await route.notify({ rawBody: notificationBody("domain.updated", "x") });

      expect(response.statusCode).toBe(200);
      expect(route.statusQuery.queried).toEqual([]);
    });

    it.each([
      ["an email event with no email id", notificationBody("email.bounced", undefined)],
      ["a body that is not JSON", "not json"],
    ])("refuses %s without asking the provider", async (_case, rawBody) => {
      const response = await route.notify({ rawBody });

      expect(response.statusCode).toBe(400);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("validation_failed");
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
