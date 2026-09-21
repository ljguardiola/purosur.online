import { describe, expect, it } from "vitest";
import { scrubSentryEvent } from "./sentry-scrubbing.js";

describe("scrubSentryEvent", () => {
  it("drops the HTTP request entirely, including its body", () => {
    const event = {
      message: "unhandled error",
      request: {
        url: "https://cloud.purosur.online/fiscal/authorize",
        data: { event_id: "evt_1", type: "sale_completed" },
        headers: { authorization: "Bearer token", cookie: "session=abc" },
      },
    };

    expect(scrubSentryEvent(event).request).toBeUndefined();
  });

  it("drops the HTTP response entirely, including its body", () => {
    const event = {
      message: "unhandled error",
      contexts: {
        response: { status_code: 500, data: { secret: "leaked" } },
      },
    };

    expect(scrubSentryEvent(event).contexts).toEqual({});
  });

  it("redacts the query string of every URL in the message", () => {
    const event = {
      message: "GET https://cloud.purosur.online/health?token=abc123 failed",
    };

    expect(scrubSentryEvent(event).message).toBe(
      "GET https://cloud.purosur.online/health?[redacted] failed",
    );
  });

  it("leaves a URL without a query string untouched", () => {
    const event = { message: "GET https://cloud.purosur.online/health failed" };

    expect(scrubSentryEvent(event).message).toBe("GET https://cloud.purosur.online/health failed");
  });

  it("redacts extra and tags keys that look like tokens, keys, secrets, passwords or credentials", () => {
    const event = {
      extra: {
        token: "abc",
        apiKey: "def",
        secret_value: "ghi",
        password: "jkl",
        Authorization: "Bearer xyz",
        database_url: "postgres://user:pass@host/db",
        register_id: "register-1",
      },
      tags: { auth_cookie: "session=abc", event_id: "evt-1" },
    };

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.extra).toEqual({
      token: "[redacted]",
      apiKey: "[redacted]",
      secret_value: "[redacted]",
      password: "[redacted]",
      Authorization: "[redacted]",
      database_url: "[redacted]",
      register_id: "register-1",
    });
    expect(scrubbed.tags).toEqual({
      auth_cookie: "[redacted]",
      event_id: "evt-1",
    });
  });

  it("redacts a bearer token or cookie value found in a string", () => {
    const event = { message: "rejected with authorization: Bearer abc.def.ghi" };

    expect(scrubSentryEvent(event).message).toBe("rejected with authorization: [redacted]");
  });

  it("keeps opaque ids and passes through fields it does not touch", () => {
    const event = {
      level: "error" as const,
      message: "sale completed",
      extra: { register_id: "reg-1", device_id: "dev-1", event_id: "evt-1" },
    };

    expect(scrubSentryEvent(event)).toEqual(event);
  });

  it("redacts identifiers in exception values while preserving type and stacktrace", () => {
    const stacktrace = { frames: [{ filename: "app.js", lineno: 42, colno: 7 }] };
    const event = {
      exception: {
        values: [
          {
            type: "PoolError",
            value: "connection to postgres://user:pass@host/db failed",
            stacktrace,
          },
        ],
      },
    };

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.exception?.values?.[0]?.type).toBe("PoolError");
    expect(scrubbed.exception?.values?.[0]?.value).toBe("connection to [redacted] failed");
    expect(scrubbed.exception?.values?.[0]?.stacktrace).toBe(stacktrace);
  });

  it("redacts sensitive data and urls carried by a breadcrumb", () => {
    const event = {
      breadcrumbs: [
        {
          category: "http",
          message: "PUT https://bucket.example.com/x.db?X-Amz-Signature=abc",
          data: { token: "secret-token", url: "https://bucket.example.com/x.db?sig=1" },
        },
      ],
    };

    expect(scrubSentryEvent(event).breadcrumbs).toEqual([
      {
        category: "http",
        message: "PUT https://bucket.example.com/x.db?[redacted]",
        data: { token: "[redacted]", url: "https://bucket.example.com/x.db?[redacted]" },
      },
    ]);
  });
});
