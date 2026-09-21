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
