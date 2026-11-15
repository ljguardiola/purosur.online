import { afterEach, describe, expect, it, vi } from "vitest";
import { getResendEmail, postResendEmail, ResendRefusalError } from "./resend-email-api.js";

function fakeFetch(response: { ok: boolean; status: number; body?: string }) {
  return vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    text: async () => response.body ?? "{}",
  });
}

const MESSAGE = { from: "a@example.com", to: ["b@example.com"], subject: "Hola" };

afterEach(() => {
  vi.useRealTimers();
});

describe("postResendEmail", () => {
  it("posts the message to the Resend API with the key and answers the body of the response", async () => {
    const fetch = fakeFetch({ ok: true, status: 200, body: '{"id":"msg-1"}' });

    const body = await postResendEmail({ apiKey: "re_test_key", fetch }, MESSAGE);

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer re_test_key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual(MESSAGE);
    expect(body).toBe('{"id":"msg-1"}');
  });

  it("sends the headers it is given along with the request", async () => {
    const fetch = fakeFetch({ ok: true, status: 200 });

    await postResendEmail({ apiKey: "re_test_key", fetch }, MESSAGE, {
      "Idempotency-Key": "alert-email/delivery-1",
    });

    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      Authorization: "Bearer re_test_key",
      "Idempotency-Key": "alert-email/delivery-1",
    });
  });

  it("rejects with a refusal carrying the status and body when the Resend API does not answer 2xx", async () => {
    const fetch = fakeFetch({ ok: false, status: 422, body: "invalid from" });

    const rejection = postResendEmail({ apiKey: "re_test_key", fetch }, MESSAGE);

    await expect(rejection).rejects.toThrow("Resend API responded 422: invalid from");
    await expect(rejection).rejects.toBeInstanceOf(ResendRefusalError);
  });

  it("rejects with no refusal when the request itself fails", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    await expect(
      postResendEmail({ apiKey: "re_test_key", fetch }, MESSAGE),
    ).rejects.not.toBeInstanceOf(ResendRefusalError);
  });

  it("gives up on a request that never answers after ten seconds", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const rejection = expect(
      postResendEmail({ apiKey: "re_test_key", fetch }, MESSAGE),
    ).rejects.toThrow("Resend API did not answer within 10000 ms");

    await vi.advanceTimersByTimeAsync(10_000);

    await rejection;
  });
});

describe("getResendEmail", () => {
  it("gets the email from the Resend API with the key and answers the body of the response", async () => {
    const fetch = fakeFetch({ ok: true, status: 200, body: '{"last_event":"delivered"}' });

    const body = await getResendEmail({ apiKey: "re_test_key", fetch }, "msg-1");

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails/msg-1");
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test_key" });
    expect(body).toBe('{"last_event":"delivered"}');
  });

  it("keeps an id from reaching beyond the emails it names", async () => {
    const fetch = fakeFetch({ ok: true, status: 200 });

    await getResendEmail({ apiKey: "re_test_key", fetch }, "../api-keys");

    const [url] = fetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.resend.com/emails/..%2Fapi-keys");
  });

  it("rejects with a refusal carrying the status and body when the Resend API does not answer 2xx", async () => {
    const fetch = fakeFetch({ ok: false, status: 404, body: "not found" });

    const rejection = getResendEmail({ apiKey: "re_test_key", fetch }, "msg-1");

    await expect(rejection).rejects.toThrow("Resend API responded 404: not found");
    await expect(rejection).rejects.toBeInstanceOf(ResendRefusalError);
  });

  it("rejects with no refusal when the request itself fails", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    await expect(
      getResendEmail({ apiKey: "re_test_key", fetch }, "msg-1"),
    ).rejects.not.toBeInstanceOf(ResendRefusalError);
  });

  it("gives up on a request that never answers after ten seconds", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const rejection = expect(
      getResendEmail({ apiKey: "re_test_key", fetch }, "msg-1"),
    ).rejects.toThrow("Resend API did not answer within 10000 ms");

    await vi.advanceTimersByTimeAsync(10_000);

    await rejection;
  });
});
