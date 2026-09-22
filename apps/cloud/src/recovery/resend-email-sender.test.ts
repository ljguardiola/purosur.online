import { describe, expect, it, vi } from "vitest";
import { createResendRecoveryEmailSender } from "./resend-email-sender.js";

function fakeFetch(response: { ok: boolean; status: number; body?: unknown }) {
  return vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    text: async () => JSON.stringify(response.body ?? {}),
  });
}

describe("createResendRecoveryEmailSender", () => {
  it("posts the email to the Resend API with the configured from/reply-to and the given link", async () => {
    const fetch = fakeFetch({ ok: true, status: 200 });
    const sender = createResendRecoveryEmailSender({
      apiKey: "re_test_key",
      from: "Puro Sur <acceso@mail.staging.purosur.online>",
      replyTo: "purosur.comarca@gmail.com",
      fetch,
    });

    await sender.sendRecoveryLink({
      to: "ada@example.com",
      link: "https://staging.purosur.online/account-recovery/passkey#abc123",
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer re_test_key",
      "Content-Type": "application/json",
    });
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      from: "Puro Sur <acceso@mail.staging.purosur.online>",
      to: ["ada@example.com"],
      reply_to: "purosur.comarca@gmail.com",
    });
    expect(body.subject).toEqual(expect.any(String));
    expect(body.text).toContain("https://staging.purosur.online/account-recovery/passkey#abc123");
    expect(body.html).toContain("https://staging.purosur.online/account-recovery/passkey#abc123");
  });

  it("never mentions auditing in the email copy", async () => {
    const fetch = fakeFetch({ ok: true, status: 200 });
    const sender = createResendRecoveryEmailSender({
      apiKey: "re_test_key",
      from: "Puro Sur <acceso@mail.staging.purosur.online>",
      replyTo: "purosur.comarca@gmail.com",
      fetch,
    });

    await sender.sendRecoveryLink({
      to: "ada@example.com",
      link: "https://staging.purosur.online/account-recovery/passkey#abc123",
    });

    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    for (const field of [body.subject, body.text, body.html]) {
      expect(field.toLowerCase()).not.toMatch(/audit|registro de acceso/);
    }
  });

  it("throws when the Resend API responds with a non-2xx status, so the caller can retry", async () => {
    const fetch = fakeFetch({ ok: false, status: 422, body: { message: "invalid from address" } });
    const sender = createResendRecoveryEmailSender({
      apiKey: "re_test_key",
      from: "Puro Sur <acceso@mail.staging.purosur.online>",
      replyTo: "purosur.comarca@gmail.com",
      fetch,
    });

    await expect(
      sender.sendRecoveryLink({ to: "ada@example.com", link: "https://example.com/#tok" }),
    ).rejects.toThrow(/422/);
  });
});
