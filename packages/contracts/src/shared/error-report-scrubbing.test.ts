import { describe, expect, it } from "vitest";
import {
  scrubErrorReport,
  scrubErrorReportBreadcrumb,
  scrubErrorReportLog,
} from "./error-report-scrubbing.js";

describe("scrubErrorReport", () => {
  it("drops the HTTP request entirely, including its body", () => {
    const event = {
      message: "unhandled error",
      request: {
        url: "https://cloud.purosur.online/fiscal/authorize",
        data: { event_id: "evt_1", type: "sale_completed" },
        headers: { authorization: "Bearer token", cookie: "session=abc" },
      },
    };

    expect(scrubErrorReport(event).request).toBeUndefined();
  });

  it("drops the HTTP request and response contexts entirely, including their bodies", () => {
    const event = {
      message: "unhandled error",
      contexts: {
        request: { url: "https://cloud.purosur.online/fiscal/authorize", data: { cuit: "x" } },
        response: { status_code: 500, data: { secret: "leaked" } },
      },
    };

    expect(scrubErrorReport(event).contexts).toEqual({});
  });

  it("redacts the query string of every URL in the message", () => {
    const event = {
      message: "GET https://cloud.purosur.online/health?token=abc123 failed",
    };

    expect(scrubErrorReport(event).message).toBe(
      "GET https://cloud.purosur.online/health?[redacted] failed",
    );
  });

  it("redacts the query string and fragment of a relative path", () => {
    const event = {
      message: "GET /media/a.jpg?X-Amz-Signature=abc&token=x failed; see /docs/page#access_token=y",
      extra: { url: "/media/a.jpg?X-Amz-Signature=abc" },
    };

    const scrubbed = scrubErrorReport(event);

    expect(scrubbed.message).toBe("GET /media/a.jpg?[redacted] failed; see /docs/page?[redacted]");
    expect(scrubbed.extra).toEqual({ url: "/media/a.jpg?[redacted]" });
  });

  it("redacts the query string of the path in Fastify's not-found message", () => {
    const notFound = "Route GET:/media/a.jpg?X-Amz-Signature=abc not found";
    const event = {
      message: notFound,
      exception: { values: [{ type: "NotFoundError", value: notFound }] },
    };

    const scrubbed = scrubErrorReport(event);

    expect(scrubbed.message).toBe("Route GET:/media/a.jpg?[redacted] not found");
    expect(scrubbed.exception?.values?.[0]?.value).toBe(
      "Route GET:/media/a.jpg?[redacted] not found",
    );
  });

  it("redacts the query string of a relative path after a bracket or a backtick, keeping the closing delimiter", () => {
    const event = {
      message: "fetch [/media/a.jpg?sig=abc] and `/media/b.jpg?token=x` failed",
    };

    expect(scrubErrorReport(event).message).toBe(
      "fetch [/media/a.jpg?[redacted]] and `/media/b.jpg?[redacted]` failed",
    );
  });

  it("redacts a relative path query that contains a backtick, without leaking what follows it", () => {
    const event = { message: "GET /media/a.jpg?token=ab`cd failed" };

    expect(scrubErrorReport(event).message).toBe("GET /media/a.jpg?[redacted] failed");
  });

  it("redacts the query string of a protocol-relative path", () => {
    const event = {
      message: "GET //cdn.example.com/media/a.jpg?X-Amz-Signature=abc failed",
    };

    expect(scrubErrorReport(event).message).toBe(
      "GET //cdn.example.com/media/a.jpg?[redacted] failed",
    );
  });

  it("leaves an already-redacted URL unchanged when scrubbed again", () => {
    const once = scrubErrorReport({
      message: "GET https://cloud.purosur.online/media/a.jpg?token=abc failed",
    });

    expect(once.message).toBe("GET https://cloud.purosur.online/media/a.jpg?[redacted] failed");
    expect(scrubErrorReport(once).message).toBe(once.message);
  });

  it("leaves a relative path without a query string untouched", () => {
    const event = { message: "GET /fiscal/authorize returned 500" };

    expect(scrubErrorReport(event).message).toBe("GET /fiscal/authorize returned 500");
  });

  it("leaves a URL without a query string untouched", () => {
    const event = { message: "GET https://cloud.purosur.online/health failed" };

    expect(scrubErrorReport(event).message).toBe("GET https://cloud.purosur.online/health failed");
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

    const scrubbed = scrubErrorReport(event);

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

    expect(scrubErrorReport(event).extra).toEqual({
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

    expect(scrubErrorReport(event).extra).toEqual(event.extra);
  });

  it("redacts a bearer token found in a string", () => {
    for (const message of [
      "rejected with authorization: Bearer abc.def.ghi",
      "rejected with authorization: Bearer   abc.def.ghi",
    ]) {
      expect(scrubErrorReport({ message }).message).toBe("rejected with authorization: [redacted]");
    }
  });

  it("redacts the whole URL when its authority carries a credential, even without a path", () => {
    const event = { message: "cache at redis://default:secret@cache.internal:6379 refused" };

    expect(scrubErrorReport(event).message).toBe("cache at [redacted] refused");
  });

  it("keeps a URL whose path, not its authority, has an at sign", () => {
    const event = { message: "GET https://registry.npmjs.org/@sentry/node failed" };

    expect(scrubErrorReport(event).message).toBe(
      "GET https://registry.npmjs.org/@sentry/node failed",
    );
  });

  it("redacts the query of a URL that follows a question mark in the same word", () => {
    const event = { message: "callback?next=https://bucket.example.com/x.db?X-Amz-Signature=abc" };

    expect(scrubErrorReport(event).message).toBe(
      "callback?next=https://bucket.example.com/x.db?[redacted]",
    );
  });

  it("redacts an authorization value whatever its scheme, and a credential", () => {
    const event = {
      extra: { authorization: "Basic dXNlcjpwYXNz", smtp_credential: "hunter2" },
    };

    expect(scrubErrorReport(event).extra).toEqual({
      authorization: "[redacted]",
      smtp_credential: "[redacted]",
    });
  });

  it("scrubs a megabyte-long dotted word without stalling", () => {
    const message = "a.".repeat(500_000);

    expect(scrubErrorReport({ message }).message).toBe(message);
  });

  it("keeps null values", () => {
    const event = { extra: { reason: null }, contexts: { device: { model: null } } };

    expect(scrubErrorReport(event)).toEqual(event);
  });

  it("keeps opaque ids and passes through fields it does not touch", () => {
    const event = {
      level: "error" as const,
      message: "sale completed",
      extra: { register_id: "reg-1", device_id: "dev-1", event_id: "evt-1" },
    };

    expect(scrubErrorReport(event)).toEqual(event);
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

    const scrubbed = scrubErrorReport(event);

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

    expect(scrubErrorReport(event).breadcrumbs).toEqual([
      {
        category: "http",
        message: "PUT https://bucket.example.com/x.db?[redacted]",
        data: { token: "[redacted]", url: "https://bucket.example.com/x.db?[redacted]" },
      },
    ]);
  });
});

describe("scrubErrorReportBreadcrumb", () => {
  it("redacts identifiers in the breadcrumb message and data", () => {
    const breadcrumb = {
      message: "DNI 12345678 rejected",
      data: { token: "secret-token", register_id: "reg-1" },
    };

    expect(scrubErrorReportBreadcrumb(breadcrumb)).toEqual({
      message: "DNI [redacted] rejected",
      data: { token: "[redacted]", register_id: "reg-1" },
    });
  });

  it("redacts the query and fragment Sentry records apart from an outgoing request's URL", () => {
    const breadcrumb = {
      category: "http",
      data: {
        url: "https://bucket.example.com/x.db",
        "http.method": "PUT",
        "http.query": "?X-Amz-Signature=abc",
        "http.fragment": "#token=abc",
        status_code: 403,
      },
    };

    expect(scrubErrorReportBreadcrumb(breadcrumb).data).toEqual({
      url: "https://bucket.example.com/x.db",
      "http.method": "PUT",
      "http.query": "[redacted]",
      "http.fragment": "[redacted]",
      status_code: 403,
    });
  });
});

describe("scrubErrorReportLog", () => {
  it("redacts identifiers in the log message and attributes", () => {
    const log = {
      message: "CUIT 20304050607 could not sync",
      attributes: { authorization: "Bearer xyz", session_id: "s1", event_id: "evt-1" },
    };

    expect(scrubErrorReportLog(log)).toEqual({
      message: "CUIT [redacted] could not sync",
      attributes: { authorization: "[redacted]", session_id: "[redacted]", event_id: "evt-1" },
    });
  });

  it("redacts the query and fragment of every URL in the same text", () => {
    const log = {
      message: "tried http://a.example/one?sig=1 then https://b.example/two#token=2",
    };

    expect(scrubErrorReportLog(log).message).toBe(
      "tried http://a.example/one?[redacted] then https://b.example/two?[redacted]",
    );
  });
});

describe("keys", () => {
  it("redacts sensitive keys inside a context section", () => {
    const event = { contexts: { device: { device_id: "device-1", auth_token: "t", cookie: "c" } } };

    expect(scrubErrorReport(event).contexts).toEqual({
      device: { device_id: "device-1", auth_token: "[redacted]", cookie: "[redacted]" },
    });
  });

  it("redacts fields named after a CUIT, DNI or document whatever their value looks like", () => {
    const extra = {
      cuit: "cuit_20304050607",
      dni_cliente: "x_12345678",
      documento: 42,
      clienteDni: "x",
    };

    expect(scrubErrorReport({ extra }).extra).toEqual({
      cuit: "[redacted]",
      dni_cliente: "[redacted]",
      documento: "[redacted]",
      clienteDni: "[redacted]",
    });
  });

  it("keeps fields where CUIT, DNI or document only appear inside another word", () => {
    const extra = {
      circuit_breaker_state: "open",
      midnight_run: "yes",
      fiscal_document_id: "fd-1",
    };

    expect(scrubErrorReport({ extra }).extra).toEqual(extra);
  });
});

describe("identifiers in text", () => {
  it("redacts a CUIT with or without hyphens and a DNI in the message", () => {
    for (const { message, expected } of [
      {
        message: "customer CUIT 20304050607 rejected",
        expected: "customer CUIT [redacted] rejected",
      },
      { message: "CUIT 20-30405060-7 rejected", expected: "CUIT [redacted] rejected" },
      { message: "CUIT 20-30405060-7.", expected: "CUIT [redacted]." },
      { message: "DNI 12345678 rejected", expected: "DNI [redacted] rejected" },
      { message: "DNI 1234567.", expected: "DNI [redacted]." },
      { message: "cliente 12.345.678", expected: "cliente [redacted]" },
      { message: "cliente 1.234.567.", expected: "cliente [redacted]." },
      {
        message: "CUIT 20304050607 y 27304050607",
        expected: "CUIT [redacted] y [redacted]",
      },
      { message: "DNI 12345678 y 87654321", expected: "DNI [redacted] y [redacted]" },
    ]) {
      expect(scrubErrorReport({ message }).message).toBe(expected);
    }
  });

  it("redacts a CUIT or DNI glued to a label with an underscore", () => {
    const event = { message: "rechazado cuit_20304050607 y dni_12345678" };

    expect(scrubErrorReport(event).message).toBe("rechazado cuit_[redacted] y dni_[redacted]");
  });

  it("redacts a CUIT in an exception value", () => {
    const event = {
      exception: { values: [{ type: "ValidationError", value: "rejected CUIT 20304050607" }] },
    };

    expect(scrubErrorReport(event).exception?.values?.[0]?.value).toBe("rejected CUIT [redacted]");
  });

  it("keeps a UUID whose groups happen to be all digits", () => {
    const eventId = "12345678-1234-4234-8234-203040506070";
    const event = { message: `event ${eventId} rejected`, extra: { event_id: eventId } };

    expect(scrubErrorReport(event)).toEqual(event);
  });

  it("keeps text that isn't a URL even when it contains a colon and a question mark", () => {
    const event = { message: "core: is the printer connected? retrying" };

    expect(scrubErrorReport(event).message).toBe("core: is the printer connected? retrying");
  });
});

describe("identifiers stored as numbers", () => {
  it("redacts a CUIT or DNI number in extra, contexts and tags", () => {
    const event = {
      extra: { cuit: 20304050607, dni: 12345678, short_dni: 1234567, customer: 20304050607 },
      contexts: { customer: { number: 20304050607 } },
      tags: { number: 12345678 },
    };

    expect(scrubErrorReport(event)).toEqual({
      extra: {
        cuit: "[redacted]",
        dni: "[redacted]",
        short_dni: "[redacted]",
        customer: "[redacted]",
      },
      contexts: { customer: { number: "[redacted]" } },
      tags: { number: "[redacted]" },
    });
  });

  it("redacts a negative CUIT or DNI number", () => {
    expect(scrubErrorReport({ extra: { value: -20304050607 } }).extra).toEqual({
      value: "[redacted]",
    });
  });

  it("redacts a CUIT or DNI number among a console breadcrumb's arguments", () => {
    const breadcrumb = {
      category: "console",
      data: { logger: "console", arguments: ["rejected", 20304050607, 12345678] },
    };

    expect(scrubErrorReportBreadcrumb(breadcrumb).data).toEqual({
      logger: "console",
      arguments: ["rejected", "[redacted]", "[redacted]"],
    });
  });

  it("redacts a CUIT or DNI number passed to console as a log parameter", () => {
    const log = { message: "rejected", attributes: { "sentry.message.parameter.0": 20304050607 } };

    expect(scrubErrorReportLog(log).attributes).toEqual({
      "sentry.message.parameter.0": "[redacted]",
    });
  });

  it("keeps the SDK's numeric device and app diagnostics while still scrubbing context strings", () => {
    const contexts = {
      device: {
        memory_size: 17179869184,
        free_memory: 12884901888,
        processor_count: 12345678,
        processor_frequency: 12345678,
        screen_density: 12345678,
      },
      app: { app_memory: 52428800, free_memory: 10737418240 },
      culture: { locale: "es-AR cliente 12345678" },
    };

    expect(scrubErrorReport({ contexts }).contexts).toEqual({
      ...contexts,
      culture: { locale: "es-AR cliente [redacted]" },
    });
  });

  it("redacts an identifier placed under an SDK section name by anything but the SDK", () => {
    const contexts = {
      device: { memory_size: 17179869184, free_memory: "DNI 12345678", number: 20304050607 },
    };

    expect(scrubErrorReport({ contexts }).contexts).toEqual({
      device: { memory_size: 17179869184, free_memory: "DNI [redacted]", number: "[redacted]" },
    });
  });

  it("keeps a diagnostic field's number only inside the SDK's own context sections", () => {
    const contexts = { customer: { memory_size: 20304050607 }, device: [20304050607] };

    expect(scrubErrorReport({ contexts }).contexts).toEqual({
      customer: { memory_size: "[redacted]" },
      device: ["[redacted]"],
    });
  });

  it("keeps the SDK's numeric device and app diagnostics among a log's attributes", () => {
    const log = {
      message: "core restarted",
      attributes: {
        "device.memory_size": 17179869184,
        "app.app_memory": 12345678,
        memory_size: 20304050607,
        "sentry.message.parameter.0": 20304050607,
      },
    };

    expect(scrubErrorReportLog(log).attributes).toEqual({
      "device.memory_size": 17179869184,
      "app.app_memory": 12345678,
      memory_size: "[redacted]",
      "sentry.message.parameter.0": "[redacted]",
    });
  });

  it("keeps numbers that can't be a CUIT or DNI", () => {
    const extra = {
      status_code: 503,
      attempt: 3,
      six_digits: 123456,
      nine_digits: 123456789,
      twelve_digits: 123456789012,
      timestamp_s: 1726920000,
      ratio: 12345678.5,
    };

    expect(scrubErrorReport({ extra }).extra).toEqual(extra);
  });
});
