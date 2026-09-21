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

  it("redacts the query string and fragment of a relative path", () => {
    const event = {
      message: "GET /media/a.jpg?X-Amz-Signature=abc&token=x failed; see /docs/page#access_token=y",
      extra: { url: "/media/a.jpg?X-Amz-Signature=abc" },
    };

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.message).toBe("GET /media/a.jpg?[redacted] failed; see /docs/page?[redacted]");
    expect(scrubbed.extra).toEqual({ url: "/media/a.jpg?[redacted]" });
  });

  it("redacts the query string of the path in Fastify's not-found message", () => {
    const notFound = "Route GET:/media/a.jpg?X-Amz-Signature=abc not found";
    const event = {
      message: notFound,
      exception: { values: [{ type: "NotFoundError", value: notFound }] },
    };

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.message).toBe("Route GET:/media/a.jpg?[redacted] not found");
    expect(scrubbed.exception?.values?.[0]?.value).toBe(
      "Route GET:/media/a.jpg?[redacted] not found",
    );
  });

  it("redacts the query string of a relative path after a bracket or a backtick", () => {
    const event = {
      message: "fetch [/media/a.jpg?sig=abc] and `/media/b.jpg?token=x` failed",
    };

    expect(scrubSentryEvent(event).message).toBe(
      "fetch [/media/a.jpg?[redacted] and `/media/b.jpg?[redacted]` failed",
    );
  });

  it("leaves an already-redacted URL unchanged when scrubbed again", () => {
    const once = scrubSentryEvent({
      message: "GET https://cloud.purosur.online/media/a.jpg?token=abc failed",
    });

    expect(once.message).toBe("GET https://cloud.purosur.online/media/a.jpg?[redacted] failed");
    expect(scrubSentryEvent(once).message).toBe(once.message);
  });

  it("leaves a relative path without a query string untouched", () => {
    const event = { message: "GET /fiscal/authorize returned 500" };

    expect(scrubSentryEvent(event).message).toBe("GET /fiscal/authorize returned 500");
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

  it("redacts keys naming a session identifier, a CUIT or a DNI", () => {
    const event = {
      extra: {
        session: "s1",
        sessionId: "s2",
        backoffice_session_id: "s3",
        cuit: "20-12345678-9",
        issuerCuit: "30-12345678-1",
        customer_dni: "12345678",
        Dni: "87654321",
      },
    };

    expect(scrubSentryEvent(event).extra).toEqual({
      session: "[redacted]",
      sessionId: "[redacted]",
      backoffice_session_id: "[redacted]",
      cuit: "[redacted]",
      issuerCuit: "[redacted]",
      customer_dni: "[redacted]",
      Dni: "[redacted]",
    });
  });

  it("does not redact keys that merely contain those letters inside another word", () => {
    const event = { extra: { admin_count: 2, circuit_id: "c-1", fiscal_document_id: "fd-1" } };

    expect(scrubSentryEvent(event).extra).toEqual(event.extra);
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
