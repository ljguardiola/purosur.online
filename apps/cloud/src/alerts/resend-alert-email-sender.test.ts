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

function senderWith(fetch: typeof globalThis.fetch) {
  return createResendAlertEmailSender({
    apiKey: "re_test_key",
    emailFrom: FICTIONAL_RECOVERY_SENDER,
    replyTo: FICTIONAL_RECOVERY_REPLY_TO,
    backofficeOrigin: ORIGIN,
    fetch,
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
  it("posts the email from the alerts' sender with the recovery emails' reply-to and its idempotency key", async () => {
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
    });
  });

  it("answers sent with the id the provider gave the message", async () => {
    const fetch = fakeFetch({ ok: true, status: 200, body: '{"id":"msg-1"}' });

    const result = await senderWith(fetch).sendAlertEmail(EMAIL);

    expect(result).toEqual({ kind: "sent", providerMessageId: "msg-1" });
  });

  it("answers failed with the provider's refusal instead of throwing", async () => {
    const fetch = fakeFetch({ ok: false, status: 429, body: "rate limited" });

    const result = await senderWith(fetch).sendAlertEmail(EMAIL);

    expect(result).toEqual({ kind: "failed", error: "Resend API responded 429: rate limited" });
  });

  it("answers failed when the request itself fails", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    const result = await senderWith(fetch).sendAlertEmail(EMAIL);

    expect(result).toEqual({ kind: "failed", error: "connect ECONNREFUSED" });
  });

  it("answers failed when the provider accepts the email without giving an id", async () => {
    const fetch = fakeFetch({ ok: true, status: 200, body: "{}" });

    const result = await senderWith(fetch).sendAlertEmail(EMAIL);

    expect(result).toEqual({
      kind: "failed",
      error: "Resend API accepted the email without a message id",
    });
  });

  it("answers failed, without calling the provider, for an alert of a kind that never goes by email", async () => {
    const fetch = fakeFetch({ ok: true, status: 200, body: '{"id":"msg-1"}' });

    const result = await senderWith(fetch).sendAlertEmail({ ...EMAIL, kind: "lots_expiring" });

    expect(result).toEqual({
      kind: "failed",
      error: "alert kind lots_expiring is not sent by email",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
