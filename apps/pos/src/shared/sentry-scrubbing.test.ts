import { describe, expect, it } from "vitest";
import { scrubSentryBreadcrumb, scrubSentryEvent, scrubSentryLog } from "./sentry-scrubbing";

describe("scrubSentryEvent", () => {
  it("redacts an 11-digit CUIT in the message", () => {
    const event = { message: "customer CUIT 20304050607 rejected the sale" };

    expect(scrubSentryEvent(event).message).toBe("customer CUIT [redacted] rejected the sale");
  });

  it("redacts a dash-formatted CUIT in the message", () => {
    const event = { message: "CUIT 20-30405060-7 rejected the sale" };

    expect(scrubSentryEvent(event).message).toBe("CUIT [redacted] rejected the sale");
  });

  it("redacts a 7 to 8 digit DNI in the message", () => {
    const event = { message: "DNI 12345678 could not be validated" };

    expect(scrubSentryEvent(event).message).toBe("DNI [redacted] could not be validated");
  });

  it("redacts identifiers in exception values while preserving error type and stack frames", () => {
    const stacktrace = { frames: [{ filename: "app.js", lineno: 42, colno: 7 }] };
    const event = {
      exception: {
        values: [
          {
            type: "ValidationError",
            value: "rejected CUIT 20304050607",
            stacktrace,
          },
        ],
      },
    };

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.exception?.values?.[0]?.type).toBe("ValidationError");
    expect(scrubbed.exception?.values?.[0]?.value).toBe("rejected CUIT [redacted]");
    expect(scrubbed.exception?.values?.[0]?.stacktrace).toBe(stacktrace);
  });

  it("drops the HTTP request entirely, including any outbox event payload it carried", () => {
    const event = {
      message: "sync failed",
      request: {
        url: "https://cloud.purosur.online/fiscal/authorize",
        data: { event_id: "evt_1", type: "sale_completed", cuit: "20304050607" },
      },
    };

    expect(scrubSentryEvent(event).request).toBeUndefined();
  });

  it("redacts the query string of a presigned URL found in extra", () => {
    const event = {
      extra: {
        upload_url: "https://bucket.example.com/snapshot.db?X-Amz-Signature=abc123&Expires=99",
      },
    };

    expect(scrubSentryEvent(event).extra).toEqual({
      upload_url: "https://bucket.example.com/snapshot.db?[redacted]",
    });
  });

  it("redacts extra and contexts keys that look like tokens, keys, secrets, passwords or credentials", () => {
    const event = {
      extra: {
        token: "abc",
        apiKey: "def",
        secret_value: "ghi",
        password: "jkl",
        Authorization: "Bearer xyz",
        register_id: "register-1",
      },
      contexts: {
        device: { device_id: "device-1", auth_token: "should-not-leak" },
      },
    };

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.extra).toEqual({
      token: "[redacted]",
      apiKey: "[redacted]",
      secret_value: "[redacted]",
      password: "[redacted]",
      Authorization: "[redacted]",
      register_id: "register-1",
    });
    expect(scrubbed.contexts).toEqual({
      device: { device_id: "device-1", auth_token: "[redacted]" },
    });
  });

  it("keeps opaque ids untouched", () => {
    const event = {
      extra: { register_id: "reg-1", device_id: "dev-1", event_id: "evt-1" },
    };

    expect(scrubSentryEvent(event).extra).toEqual({
      register_id: "reg-1",
      device_id: "dev-1",
      event_id: "evt-1",
    });
  });

  it("passes through fields it does not touch, and a message with nothing sensitive, unchanged", () => {
    const event = { level: "error" as const, message: "sale completed" };

    expect(scrubSentryEvent(event)).toEqual({ level: "error", message: "sale completed" });
  });
});

describe("scrubSentryBreadcrumb", () => {
  it("redacts identifiers in the breadcrumb message and data", () => {
    const breadcrumb = {
      message: "DNI 12345678 rejected",
      data: { token: "secret-token", register_id: "reg-1" },
    };

    expect(scrubSentryBreadcrumb(breadcrumb)).toEqual({
      message: "DNI [redacted] rejected",
      data: { token: "[redacted]", register_id: "reg-1" },
    });
  });
});

describe("scrubSentryLog", () => {
  it("redacts identifiers in the log message and attributes", () => {
    const log = {
      message: "CUIT 20304050607 could not sync",
      attributes: { authorization: "Bearer xyz", event_id: "evt-1" },
    };

    expect(scrubSentryLog(log)).toEqual({
      message: "CUIT [redacted] could not sync",
      attributes: { authorization: "[redacted]", event_id: "evt-1" },
    });
  });
});

describe("text that isn't a URL", () => {
  it("is left intact even when it contains a colon and a question mark", () => {
    const event = { message: "core: is the printer connected? retrying" };

    expect(scrubSentryEvent(event).message).toBe("core: is the printer connected? retrying");
  });
});

describe("URLs inside longer text", () => {
  it("redacts the query of a presigned URL and keeps the text around it", () => {
    const event = {
      message: "upload to https://bucket.example.com/x.db?X-Amz-Signature=abc failed",
    };

    expect(scrubSentryEvent(event).message).toBe(
      "upload to https://bucket.example.com/x.db?[redacted] failed",
    );
  });

  it("redacts the query and fragment of every URL in the same text", () => {
    const log = {
      message: "tried http://a.example/one?sig=1 then https://b.example/two#token=2",
    };

    expect(scrubSentryLog(log).message).toBe(
      "tried http://a.example/one?[redacted] then https://b.example/two?[redacted]",
    );
  });

  it("leaves a URL without a query as it is", () => {
    const event = { message: "GET https://cloud.purosur.online/health failed" };

    expect(scrubSentryEvent(event).message).toBe("GET https://cloud.purosur.online/health failed");
  });
});

describe("outgoing request breadcrumbs", () => {
  it("redacts the query and fragment Sentry records apart from the URL", () => {
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

    expect(scrubSentryBreadcrumb(breadcrumb).data).toEqual({
      url: "https://bucket.example.com/x.db",
      "http.method": "PUT",
      "http.query": "[redacted]",
      "http.fragment": "[redacted]",
      status_code: 403,
    });
  });
});

describe("identifiers written with separators", () => {
  it("redacts a DNI written with thousands separators", () => {
    for (const { message, expected } of [
      { message: "cliente 12.345.678", expected: "cliente [redacted]" },
      { message: "cliente 1.234.567.", expected: "cliente [redacted]." },
      { message: "DNI 12345678.", expected: "DNI [redacted]." },
    ]) {
      expect(scrubSentryEvent({ message }).message).toBe(expected);
    }
  });

  it("redacts a CUIT written with hyphens at the end of a sentence", () => {
    expect(scrubSentryEvent({ message: "CUIT 20-30405060-7." }).message).toBe("CUIT [redacted].");
  });

  it("keeps a UUID whose groups happen to be all digits", () => {
    const eventId = "12345678-1234-4234-8234-203040506070";
    const event = { message: `event ${eventId} rejected`, extra: { event_id: eventId } };

    expect(scrubSentryEvent(event)).toEqual(event);
  });
});

describe("identifiers stored as numbers", () => {
  it("redacts a CUIT or DNI number in extra, contexts and tags", () => {
    const event = {
      extra: { cuit: 20304050607, dni: 12345678, short_dni: 1234567 },
      contexts: { customer: { document: 20304050607 } },
      tags: { dni: 12345678 },
    };

    expect(scrubSentryEvent(event)).toEqual({
      extra: { cuit: "[redacted]", dni: "[redacted]", short_dni: "[redacted]" },
      contexts: { customer: { document: "[redacted]" } },
      tags: { dni: "[redacted]" },
    });
  });

  it("redacts a CUIT or DNI number among a console breadcrumb's arguments", () => {
    const breadcrumb = {
      category: "console",
      data: { logger: "console", arguments: ["rejected", 20304050607, 12345678] },
    };

    expect(scrubSentryBreadcrumb(breadcrumb).data).toEqual({
      logger: "console",
      arguments: ["rejected", "[redacted]", "[redacted]"],
    });
  });

  it("redacts a CUIT or DNI number passed to console as a log parameter", () => {
    const log = {
      message: "rejected",
      attributes: { "sentry.message.parameter.0": 20304050607 },
    };

    expect(scrubSentryLog(log).attributes).toEqual({
      "sentry.message.parameter.0": "[redacted]",
    });
  });

  it("keeps the SDK's numeric device and app diagnostics while still scrubbing context strings", () => {
    const contexts = {
      device: { memory_size: 17179869184, free_memory: 12884901888 },
      app: { app_memory: 52428800, free_memory: 10737418240 },
      culture: { locale: "es-AR cliente 12345678" },
    };

    expect(scrubSentryEvent({ contexts }).contexts).toEqual({
      device: { memory_size: 17179869184, free_memory: 12884901888 },
      app: { app_memory: 52428800, free_memory: 10737418240 },
      culture: { locale: "es-AR cliente [redacted]" },
    });
  });

  it("redacts an identifier number placed under an SDK section name by anything but the SDK", () => {
    const contexts = { device: { memory_size: 17179869184, document: 20304050607 } };

    expect(scrubSentryEvent({ contexts }).contexts).toEqual({
      device: { memory_size: 17179869184, document: "[redacted]" },
    });
  });

  it("keeps a diagnostic field's number only inside the SDK's own context sections", () => {
    const contexts = { customer: { memory_size: 20304050607 } };

    expect(scrubSentryEvent({ contexts }).contexts).toEqual({
      customer: { memory_size: "[redacted]" },
    });
  });

  it("keeps the SDK's numeric device diagnostics among a log's attributes", () => {
    const log = {
      message: "core restarted",
      attributes: {
        "device.memory_size": 17179869184,
        "device.processor_frequency": 2400,
        "sentry.message.parameter.0": 20304050607,
      },
    };

    expect(scrubSentryLog(log).attributes).toEqual({
      "device.memory_size": 17179869184,
      "device.processor_frequency": 2400,
      "sentry.message.parameter.0": "[redacted]",
    });
  });

  it("redacts a CUIT or DNI glued to a label with an underscore", () => {
    const event = { message: "rechazado cuit_20304050607 y dni_12345678" };

    expect(scrubSentryEvent(event).message).toBe("rechazado cuit_[redacted] y dni_[redacted]");
  });

  it("matches CUIT, DNI and document only as whole words of a field name", () => {
    const extra = { circuit_breaker_state: "open", clienteDni: "x", midnight_run: "yes" };

    expect(scrubSentryEvent({ extra }).extra).toEqual({
      circuit_breaker_state: "open",
      clienteDni: "[redacted]",
      midnight_run: "yes",
    });
  });

  it("redacts fields named after a CUIT, DNI or document whatever their value looks like", () => {
    const extra = { cuit: "cuit_20304050607", dni_cliente: "x_12345678", documento: 42 };

    expect(scrubSentryEvent({ extra }).extra).toEqual({
      cuit: "[redacted]",
      dni_cliente: "[redacted]",
      documento: "[redacted]",
    });
  });

  it("keeps numbers that can't be a CUIT or DNI", () => {
    const extra = {
      status_code: 503,
      attempt: 3,
      elapsed_ms: 1250.5,
      timestamp_ms: 1726920000000,
      timestamp_s: 1726920000,
      ratio: 12345678.5,
    };

    expect(scrubSentryEvent({ extra }).extra).toEqual(extra);
  });
});
