import type { AlertEmail } from "@purosur/domain/alerts/use-cases";
import { describe, expect, it, vi } from "vitest";
import {
  FICTIONAL_RECOVERY_REPLY_TO,
  FICTIONAL_RECOVERY_SENDER,
} from "../test-support/recovery-email.js";
import { alertEmailContent } from "./alert-email-content.js";
import { alertSenderOf, createResendAlertEmailSender } from "./resend-alert-email-sender.js";

const ORIGIN = "https://staging.purosur.online";

const EMAIL: AlertEmail = {
  deliveryId: "delivery-1",
  to: "ada@example.com",
  alertId: "alert-1",
  kind: "register_silent",
  stage: "escalated",
  level: "critical",
  branchName: "Puro Sur",
  occurredAt: new Date("2026-10-01T15:30:00.000Z"),
};

function fakeFetch(response: { ok: boolean; status: number; body: string }) {
  return vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    text: async () => response.body,
  });
}

function senderWith(fetch: typeof globalThis.fetch, warn: (message: string) => void = () => {}) {
  return createResendAlertEmailSender({
    apiKey: "re_test_key",
    emailFrom: FICTIONAL_RECOVERY_SENDER,
    replyTo: FICTIONAL_RECOVERY_REPLY_TO,
    backofficeOrigin: ORIGIN,
    fetch,
    warn,
  });
}

describe("alertSenderOf", () => {
  it.each([
    ["Almacén de prueba <acceso@example.com>", "Puro Sur Alertas <alertas@example.com>"],
    ["acceso@example.com", "Puro Sur Alertas <alertas@example.com>"],
    ["<acceso@mail.example.com>", "Puro Sur Alertas <alertas@mail.example.com>"],
  ])("takes the domain of the recovery emails' sender %s", (emailFrom, sender) => {
    expect(alertSenderOf(emailFrom)).toBe(sender);
  });

  it("refuses a sender with no domain", () => {
    expect(() => alertSenderOf("Almacén de prueba")).toThrow(
      "the recovery email sender has no address to take the alerts' domain from",
    );
  });
});

describe("createResendAlertEmailSender", () => {
  it("posts the email from the alerts' sender with the recovery emails' reply-to, its idempotency key and the tag of its delivery", async () => {
    const fetch = fakeFetch({ ok: true, status: 200, body: '{"id":"msg-1"}' });

    await senderWith(fetch).sendAlertEmail(EMAIL);

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer re_test_key",
      "Idempotency-Key": "alert-email/delivery-1",
    });
    const content = alertEmailContent(EMAIL, ORIGIN);
    expect(JSON.parse(init.body as string)).toEqual({
      from: "Puro Sur Alertas <alertas@example.com>",
      to: ["ada@example.com"],
      reply_to: FICTIONAL_RECOVERY_REPLY_TO,
      subject: content.subject,
      text: content.text,
      html: content.html,
      tags: [{ name: "alert_email_delivery", value: "delivery-1" }],
    });
  });

  it("answers sent with the id the provider gave the message", async () => {
    const fetch = fakeFetch({ ok: true, status: 200, body: '{"id":"msg-1"}' });

    const result = await senderWith(fetch).sendAlertEmail(EMAIL);

    expect(result).toEqual({ kind: "sent", providerMessageId: "msg-1" });
  });

  it("answers that the provider refused the email when it does not answer 2xx, instead of throwing", async () => {
    const fetch = fakeFetch({ ok: false, status: 429, body: "rate limited" });

    const result = await senderWith(fetch).sendAlertEmail(EMAIL);

    expect(result).toEqual({ kind: "failed", reason: "provider_refused" });
  });

  it("answers that the provider could not be reached when the request itself fails", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    const result = await senderWith(fetch).sendAlertEmail(EMAIL);

    expect(result).toEqual({ kind: "failed", reason: "provider_unreachable" });
  });

  it("answers that the provider did not confirm the email when it accepts it without giving an id", async () => {
    const fetch = fakeFetch({ ok: true, status: 200, body: "{}" });

    const result = await senderWith(fetch).sendAlertEmail(EMAIL);

    expect(result).toEqual({ kind: "failed", reason: "provider_unconfirmed" });
  });

  it.each([
    [
      "a refusal",
      fakeFetch({ ok: false, status: 429, body: "rate limited" }),
      "Resend API responded 429: rate limited",
    ],
    [
      "an unreachable provider",
      vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")),
      "connect ECONNREFUSED",
    ],
    [
      "an unconfirmed email",
      fakeFetch({ ok: true, status: 200, body: "{}" }),
      "Resend API accepted the email without a message id",
    ],
  ])(
    "logs the provider's own error of %s with the alert, delivery and stage, and never the recipient or the body",
    async (_case, fetch, providerError) => {
      const warn = vi.fn();

      await senderWith(fetch, warn).sendAlertEmail(EMAIL);

      expect(warn).toHaveBeenCalledExactlyOnceWith(
        `Alert email not sent (alert alert-1, delivery delivery-1, stage escalated): ${providerError}`,
      );
      const logged = String(warn.mock.calls[0]?.[0]);
      const content = alertEmailContent(EMAIL, ORIGIN);
      expect(logged).not.toContain(EMAIL.to);
      expect(logged).not.toContain(content.subject);
    },
  );

  it("logs nothing when the email is sent", async () => {
    const warn = vi.fn();

    await senderWith(
      fakeFetch({ ok: true, status: 200, body: '{"id":"msg-1"}' }),
      warn,
    ).sendAlertEmail(EMAIL);

    expect(warn).not.toHaveBeenCalled();
  });
});
