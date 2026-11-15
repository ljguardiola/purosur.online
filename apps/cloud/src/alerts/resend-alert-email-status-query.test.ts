import { describe, expect, it, vi } from "vitest";
import { createResendAlertEmailStatusQuery } from "./resend-alert-email-status-query.js";

function fakeFetch(response: { ok: boolean; status: number; body: string }) {
  return vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    text: async () => response.body,
  });
}

function queryWith(fetch: typeof globalThis.fetch, warn: (message: string) => void = () => {}) {
  return createResendAlertEmailStatusQuery({ apiKey: "re_test_key", fetch, warn });
}

describe("createResendAlertEmailStatusQuery", () => {
  it("asks the Resend API for the email it is given", async () => {
    const fetch = fakeFetch({ ok: true, status: 200, body: '{"last_event":"delivered"}' });

    await queryWith(fetch).queriedAlertEmailStatus("msg-1");

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails/msg-1");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test_key" });
  });

  it.each(["bounced", "failed", "suppressed", "canceled"])(
    "answers undelivered for an email whose last event is %s",
    async (lastEvent) => {
      const fetch = fakeFetch({ ok: true, status: 200, body: JSON.stringify({ last_event: lastEvent }) });

      await expect(queryWith(fetch).queriedAlertEmailStatus("msg-1")).resolves.toEqual({
        kind: "undelivered",
      });
    },
  );

  it.each(["delivered", "opened", "clicked", "complained"])(
    "answers delivered for an email whose last event is %s",
    async (lastEvent) => {
      const fetch = fakeFetch({ ok: true, status: 200, body: JSON.stringify({ last_event: lastEvent }) });

      await expect(queryWith(fetch).queriedAlertEmailStatus("msg-1")).resolves.toEqual({
        kind: "delivered",
      });
    },
  );

  it.each(["sent", "queued", "scheduled", "delivery_delayed", "a_future_event"])(
    "answers in transit for an email whose last event is %s",
    async (lastEvent) => {
      const fetch = fakeFetch({ ok: true, status: 200, body: JSON.stringify({ last_event: lastEvent }) });

      await expect(queryWith(fetch).queriedAlertEmailStatus("msg-1")).resolves.toEqual({
        kind: "in_transit",
      });
    },
  );

  it.each([
    ["the Resend API refuses the request", { ok: false, status: 404, body: "not found" }],
    ["the answer is not JSON", { ok: true, status: 200, body: "<html>" }],
    ["the answer has no last event", { ok: true, status: 200, body: "{}" }],
    ["the answer's last event is not text", { ok: true, status: 200, body: '{"last_event":3}' }],
    ["the answer is not an object", { ok: true, status: 200, body: "null" }],
  ])("answers unavailable when %s", async (_case, response) => {
    await expect(queryWith(fakeFetch(response)).queriedAlertEmailStatus("msg-1")).resolves.toEqual({
      kind: "unavailable",
    });
  });

  it("answers unavailable when the request itself fails", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    await expect(queryWith(fetch).queriedAlertEmailStatus("msg-1")).resolves.toEqual({
      kind: "unavailable",
    });
  });

  it("logs why the provider could not be asked, without the key", async () => {
    const warn = vi.fn();
    const fetch = fakeFetch({ ok: false, status: 500, body: "boom" });

    await queryWith(fetch, warn).queriedAlertEmailStatus("msg-1");

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("Resend API responded 500: boom");
    expect(warn.mock.calls[0]?.[0]).not.toContain("re_test_key");
  });
});
