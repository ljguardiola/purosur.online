import { ANOTHER_FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
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
        issuerCuit: ANOTHER_FICTIONAL_CUIT,
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

  it("marks extra, a context section or tags that refer back to themselves", () => {
    const extra: Record<string, unknown> = { id: "extra-1" };
    Object.assign(extra, { self: extra });
    const section: Record<string, unknown> = { id: "section-1" };
    Object.assign(section, { self: section });
    const device: Record<string, unknown> = { memory_size: 20123456789 };
    Object.assign(device, { self: device });
    const contexts: Record<string, unknown> = { section, device };
    Object.assign(contexts, { root: contexts });
    const tags: Record<string, unknown> = { id: "tags-1" };
    Object.assign(tags, { self: tags });

    const scrubbed = scrubErrorReport({ extra, contexts, tags });

    expect(scrubbed.extra).toStrictEqual({ id: "extra-1", self: "[circular]" });
    expect(scrubbed.contexts).toStrictEqual({
      section: { id: "section-1", self: "[circular]" },
      device: { memory_size: 20123456789, self: "[circular]" },
      root: "[circular]",
    });
    expect(scrubbed.tags).toStrictEqual({ id: "tags-1", self: "[circular]" });
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

  it("keeps the name, message and stack of an error logged to the console", () => {
    const error = new TypeError("sale sync failed");
    error.stack = "TypeError: sale sync failed\n    at syncSales (sync.ts:10:5)";
    const breadcrumb = { category: "console", data: { logger: "console", arguments: [error] } };

    expect(scrubErrorReportBreadcrumb(breadcrumb).data).toStrictEqual({
      logger: "console",
      arguments: [
        {
          name: "TypeError",
          message: "sale sync failed",
          stack: "TypeError: sale sync failed\n    at syncSales (sync.ts:10:5)",
        },
      ],
    });
  });

  it("redacts personal data and credentials in an error's message and stack", () => {
    const error = new Error(
      "customer ana.perez@example.com with CUIT 20-30405060-7 and DNI 12.345.678 rejected",
    );
    error.stack =
      "Error: connect redis://default:secret@cache.internal:6379 failed for ana.perez@example.com\n" +
      "    at fetch (https://cloud.purosur.online/assets/index.js?token=abc123:1:1)\n" +
      "    at authorize (Bearer eyJhbGciOi.payload.sig)";
    const breadcrumb = { data: { arguments: [error] } };

    expect(scrubErrorReportBreadcrumb(breadcrumb).data).toStrictEqual({
      arguments: [
        {
          name: "Error",
          message: "customer [redacted] with CUIT [redacted] and DNI [redacted] rejected",
          stack:
            "Error: connect [redacted] failed for [redacted]\n" +
            "    at fetch (https://cloud.purosur.online/assets/index.js?[redacted]:1:1)\n" +
            "    at authorize ([redacted])",
        },
      ],
    });
  });

  it("keeps an error's cause, scrubbed by the same rules", () => {
    const cause = new Error("DNI 12345678 not found");
    cause.stack = "Error: DNI 12345678 not found";
    const error = new Error("lookup failed", { cause });
    error.stack = "Error: lookup failed";
    const breadcrumb = { data: { error } };

    expect(scrubErrorReportBreadcrumb(breadcrumb).data).toStrictEqual({
      error: {
        name: "Error",
        message: "lookup failed",
        stack: "Error: lookup failed",
        cause: {
          name: "Error",
          message: "DNI [redacted] not found",
          stack: "Error: DNI [redacted] not found",
        },
      },
    });
  });

  it("keeps an error's own fields, scrubbed by the same rules", () => {
    const error = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "sales_pkey",
      token: "abc123",
    });
    error.stack = "Error: duplicate key";
    const breadcrumb = { data: { error } };

    expect(scrubErrorReportBreadcrumb(breadcrumb).data).toStrictEqual({
      error: {
        code: "23505",
        constraint: "sales_pkey",
        token: "[redacted]",
        name: "Error",
        message: "duplicate key",
        stack: "Error: duplicate key",
      },
    });
  });

  it("marks a cause that loops back to an error already in the chain instead of following it", () => {
    const first = new Error("first");
    first.stack = "Error: first";
    const second = new Error("second", { cause: first });
    second.stack = "Error: second";
    Object.defineProperty(first, "cause", { value: second });
    const breadcrumb = { data: { error: first } };

    expect(scrubErrorReportBreadcrumb(breadcrumb).data).toStrictEqual({
      error: {
        name: "Error",
        message: "first",
        stack: "Error: first",
        cause: { name: "Error", message: "second", stack: "Error: second", cause: "[circular]" },
      },
    });
  });

  it("marks an error that is its own cause", () => {
    const error = new Error("retry");
    error.stack = "Error: retry";
    error.cause = error;
    const breadcrumb = { data: { error } };

    expect(scrubErrorReportBreadcrumb(breadcrumb).data).toStrictEqual({
      error: { name: "Error", message: "retry", stack: "Error: retry", cause: "[circular]" },
    });
  });

  it("keeps hidden a cause that is not an error", () => {
    const error = new Error("sync failed", {
      cause: { response: { data: { customer: { name: "Ana" } } } },
    });
    error.stack = "Error: sync failed";
    const breadcrumb = { data: { error } };

    expect(scrubErrorReportBreadcrumb(breadcrumb).data).toStrictEqual({
      error: { name: "Error", message: "sync failed", stack: "Error: sync failed" },
    });
  });

  it("marks an error reached again through another error's field instead of following it", () => {
    const inner = new Error("inner");
    inner.stack = "Error: inner";
    const outer = new Error("outer", { cause: inner });
    outer.stack = "Error: outer";
    Object.assign(inner, { outer, nested: { outer } });
    const breadcrumb = { data: { error: outer } };

    expect(scrubErrorReportBreadcrumb(breadcrumb).data).toStrictEqual({
      error: {
        name: "Error",
        message: "outer",
        stack: "Error: outer",
        cause: {
          outer: "[circular]",
          nested: { outer: "[circular]" },
          name: "Error",
          message: "inner",
          stack: "Error: inner",
        },
      },
    });
  });

  it("sends a cause assigned as one of the error's fields through the same rules", () => {
    const error = new Error("sync failed");
    error.stack = "Error: sync failed";
    error.cause = { status: 409, token: "abc123" };
    const breadcrumb = { data: { error } };

    expect(scrubErrorReportBreadcrumb(breadcrumb).data).toStrictEqual({
      error: {
        cause: { status: 409, token: "[redacted]" },
        name: "Error",
        message: "sync failed",
        stack: "Error: sync failed",
      },
    });
  });

  it("keeps the same error readable each time it appears outside its own chain", () => {
    const error = new Error("timeout");
    error.stack = "Error: timeout";
    const breadcrumb = { data: { arguments: [error, error] } };
    const readable = { name: "Error", message: "timeout", stack: "Error: timeout" };

    expect(scrubErrorReportBreadcrumb(breadcrumb).data).toStrictEqual({
      arguments: [readable, readable],
    });
  });

  it("marks breadcrumb data that refers back to itself instead of following it", () => {
    const data: Record<string, unknown> = { token: "abc123", cuit: 20123456789 };
    Object.assign(data, { self: data });

    expect(scrubErrorReportBreadcrumb({ data }).data).toStrictEqual({
      token: "[redacted]",
      cuit: "[redacted]",
      self: "[circular]",
    });
  });

  it("marks an object that loops back to itself through other objects", () => {
    const order: Record<string, unknown> = { id: "order-1" };
    const line: Record<string, unknown> = { order, note: "ana@example.com" };
    Object.assign(order, { lines: { first: line } });
    const breadcrumb = { data: { order } };

    expect(scrubErrorReportBreadcrumb(breadcrumb).data).toStrictEqual({
      order: { id: "order-1", lines: { first: { order: "[circular]", note: "[redacted]" } } },
    });
  });

  it("marks an array that contains itself", () => {
    const items: unknown[] = ["ana@example.com"];
    items.push(items);
    const breadcrumb = { data: { arguments: items } };

    expect(scrubErrorReportBreadcrumb(breadcrumb).data).toStrictEqual({
      arguments: ["[redacted]", "[circular]"],
    });
  });

  it("marks an object reached again through one of its arrays", () => {
    const cart: Record<string, unknown> = { id: "cart-1" };
    Object.assign(cart, { items: [{ cart }] });
    const breadcrumb = { data: { cart } };

    expect(scrubErrorReportBreadcrumb(breadcrumb).data).toStrictEqual({
      cart: { id: "cart-1", items: [{ cart: "[circular]" }] },
    });
  });

  it("marks an object that loops back to itself through an error's own field", () => {
    const request: Record<string, unknown> = { id: "sync-1" };
    const error = new Error("sync failed");
    error.stack = "Error: sync failed";
    Object.assign(error, { request });
    Object.assign(request, { error });
    const breadcrumb = { data: { request } };

    expect(scrubErrorReportBreadcrumb(breadcrumb).data).toStrictEqual({
      request: {
        id: "sync-1",
        error: {
          request: "[circular]",
          name: "Error",
          message: "sync failed",
          stack: "Error: sync failed",
        },
      },
    });
  });

  it("scrubs an object shared by two branches in both places, since it is not a cycle", () => {
    const customer = { email: "ana@example.com", dni: "30123456" };
    const breadcrumb = { data: { buyer: customer, payer: { customer }, list: [customer] } };
    const scrubbed = { email: "[redacted]", dni: "[redacted]" };

    expect(scrubErrorReportBreadcrumb(breadcrumb).data).toStrictEqual({
      buyer: scrubbed,
      payer: { customer: scrubbed },
      list: [scrubbed],
    });
  });

  it("keeps a date as its ISO value", () => {
    const breadcrumb = { data: { at: new Date("2026-09-28T13:45:00.000Z") } };

    expect(scrubErrorReportBreadcrumb(breadcrumb).data).toStrictEqual({
      at: "2026-09-28T13:45:00.000Z",
    });
  });

  it("keeps an invalid date readable instead of failing", () => {
    const breadcrumb = { data: { at: new Date("not a date") } };

    expect(scrubErrorReportBreadcrumb(breadcrumb).data).toStrictEqual({ at: "Invalid Date" });
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

  it("marks a log attribute that refers back to the attributes", () => {
    const attributes: Record<string, unknown> = { id: "log-1" };
    Object.assign(attributes, { self: attributes });

    expect(scrubErrorReportLog({ attributes }).attributes).toStrictEqual({
      id: "log-1",
      self: "[circular]",
    });
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

describe("personal data in text", () => {
  it("redacts an email address in the message and in a breadcrumb's text", () => {
    const event = {
      message: "no customer for ana.perez@example.com",
      breadcrumbs: [
        { message: "sent to Juan_Diaz+caja@mail.example.com.ar", data: { to: "ana@example.com" } },
      ],
    };

    const scrubbed = scrubErrorReport(event);

    expect(scrubbed.message).toBe("no customer for [redacted]");
    expect(scrubbed.breadcrumbs).toStrictEqual([
      { message: "sent to [redacted]", data: { to: "[redacted]" } },
    ]);
  });

  it("keeps package and release names that carry an at sign", () => {
    const message = "@sentry/node@10.75.3 in purosur-pos@1.2.3 failed";

    expect(scrubErrorReport({ message }).message).toBe(message);
  });

  it("redacts the account name in a home folder path while keeping the frame's file, line and column", () => {
    for (const { frame, expected } of [
      {
        frame: "at start (/home/ana/purosur/dist/main.js:10:5)",
        expected: "at start (/home/[redacted]/purosur/dist/main.js:10:5)",
      },
      {
        frame: "at start (file:///Users/ana/purosur/dist/main.js:10:5)",
        expected: "at start (file:///Users/[redacted]/purosur/dist/main.js:10:5)",
      },
      {
        frame: String.raw`at start (C:\\Users\\ana\\AppData\\Local\\purosur\\main.js:10:5)`,
        expected: String.raw`at start (C:\\Users\\[redacted]\\AppData\\Local\\purosur\\main.js:10:5)`,
      },
      {
        frame: String.raw`at start (C:\Users\ana.perez\AppData\Local\purosur\main.js:10:5)`,
        expected: String.raw`at start (C:\Users\[redacted]\AppData\Local\purosur\main.js:10:5)`,
      },
      {
        frame: "at start (file:///c:/Users/ana/purosur/main.js:10:5)",
        expected: "at start (file:///c:/Users/[redacted]/purosur/main.js:10:5)",
      },
    ]) {
      expect(scrubErrorReport({ message: frame }).message).toBe(expected);
    }
  });

  it("redacts a Windows account name that has a space", () => {
    for (const { frame, expected } of [
      {
        frame: String.raw`at start (C:\Users\Juan Perez\AppData\Local\purosur\main.js:10:5)`,
        expected: String.raw`at start (C:\Users\[redacted]\AppData\Local\purosur\main.js:10:5)`,
      },
      {
        frame: String.raw`at start (C:\\Users\\Juan Perez\\AppData\\main.js:10:5)`,
        expected: String.raw`at start (C:\\Users\\[redacted]\\AppData\\main.js:10:5)`,
      },
    ]) {
      expect(scrubErrorReport({ message: frame }).message).toBe(expected);
    }
  });

  it("redacts the account name in a home folder nested under another folder", () => {
    for (const { frame, expected } of [
      {
        frame: "at start (/var/home/ana/purosur/main.js:10:5)",
        expected: "at start (/var/home/[redacted]/purosur/main.js:10:5)",
      },
      {
        frame: "at start (/mnt/c/Users/ana/purosur/main.js:10:5)",
        expected: "at start (/mnt/c/Users/[redacted]/purosur/main.js:10:5)",
      },
      {
        frame: "at start (/c/Users/ana/purosur/main.js:10:5)",
        expected: "at start (/c/Users/[redacted]/purosur/main.js:10:5)",
      },
      {
        frame: "at start (/cygdrive/c/Users/ana/purosur/main.js:10:5)",
        expected: "at start (/cygdrive/c/Users/[redacted]/purosur/main.js:10:5)",
      },
      {
        frame: "at start (/export/home/ana/purosur/main.js:10:5)",
        expected: "at start (/export/home/[redacted]/purosur/main.js:10:5)",
      },
      {
        frame: "at render (http://localhost:5173/@fs/home/ana/purosur/button.tsx?t=1:10:5)",
        expected:
          "at render (http://localhost:5173/@fs/home/[redacted]/purosur/button.tsx?[redacted]:10:5)",
      },
    ]) {
      expect(scrubErrorReport({ message: frame }).message).toBe(expected);
    }
  });

  it("redacts the account name at the end of a home folder path", () => {
    for (const { message, expected } of [
      {
        message: "ENOENT: no such file or directory, scandir '/home/ana'",
        expected: "ENOENT: no such file or directory, scandir '/home/[redacted]'",
      },
      { message: String.raw`C:\Users\ana`, expected: String.raw`C:\Users\[redacted]` },
      {
        message: String.raw`ENOENT: no such file or directory, scandir 'C:\Users\Juan Perez'`,
        expected: String.raw`ENOENT: no such file or directory, scandir 'C:\Users\[redacted]`,
      },
      { message: String.raw`C:\Users\Juan Perez`, expected: String.raw`C:\Users\[redacted]` },
      {
        message: "could not read /home/ana.",
        expected: "could not read /home/[redacted].",
      },
      {
        message: "could not read /home/ana.perez. Retrying",
        expected: "could not read /home/[redacted]. Retrying",
      },
      {
        message: "paths: /home/ana, /Users/juan; HOME=/home/ana:/bin [/home/ana]",
        expected:
          "paths: /home/[redacted], /Users/[redacted]; HOME=/home/[redacted]:/bin [/home/[redacted]]",
      },
      { message: "C:/Users/ana", expected: "C:/Users/[redacted]" },
      {
        message: "could not read /home/ana.perez.",
        expected: "could not read /home/[redacted].",
      },
    ]) {
      expect(scrubErrorReport({ message }).message).toBe(expected);
    }
  });

  it("hides everything after a Windows account up to the next folder or line, since the name may contain any character", () => {
    for (const { message, expected } of [
      {
        message: String.raw`cannot write C:\Users\ana: access denied`,
        expected: String.raw`cannot write C:\Users\[redacted]`,
      },
      {
        message: "cannot write C:/Users/ana now\nretrying",
        expected: "cannot write C:/Users/[redacted]\nretrying",
      },
      {
        message: "cannot write C:/Users/ana now\r\nretrying",
        expected: "cannot write C:/Users/[redacted]\r\nretrying",
      },
    ]) {
      expect(scrubErrorReport({ message }).message).toBe(expected);
    }
  });

  it("redacts a Windows account with an apostrophe, a parenthesis or a space, whatever the slashes", () => {
    for (const { frame, expected } of [
      {
        frame: String.raw`at start (C:\Users\D'Angelo\AppData\main.js:10:5)`,
        expected: String.raw`at start (C:\Users\[redacted]\AppData\main.js:10:5)`,
      },
      {
        frame: String.raw`at start (C:\Users\Juan (Caja)\AppData\main.js:10:5)`,
        expected: String.raw`at start (C:\Users\[redacted]\AppData\main.js:10:5)`,
      },
      {
        frame: 'Failed to resolve import from "C:/Users/Juan Perez/purosur/src/x.tsx"',
        expected: 'Failed to resolve import from "C:/Users/[redacted]/purosur/src/x.tsx"',
      },
      {
        frame: "at start (/mnt/c/Users/Juan Perez/purosur/main.js:10:5)",
        expected: "at start (/mnt/c/Users/[redacted]/purosur/main.js:10:5)",
      },
      {
        frame: "at start (/c/Users/D'Angelo/purosur/main.js:10:5)",
        expected: "at start (/c/Users/[redacted]/purosur/main.js:10:5)",
      },
      {
        frame: "at start (/cygdrive/c/Users/Juan (Caja)/purosur/main.js:10:5)",
        expected: "at start (/cygdrive/c/Users/[redacted]/purosur/main.js:10:5)",
      },
    ]) {
      expect(scrubErrorReport({ message: frame }).message).toBe(expected);
    }
  });

  it("keeps a backoffice route under the home area", () => {
    const breadcrumb = {
      category: "navigation",
      data: { from: "/home/alerts?tab=1", to: "/home/alerts" },
    };

    expect(scrubErrorReportBreadcrumb(breadcrumb).data).toStrictEqual({
      from: "/home/alerts?[redacted]",
      to: "/home/alerts",
    });
  });

  it("keeps a URL whose path has a home or Users folder", () => {
    const message = "GET https://cloud.purosur.online/home/banner and /api/Users/42/roles failed";

    expect(scrubErrorReport({ message }).message).toBe(message);
  });

  it("keeps a stack frame's line and column after redacting a relative path's query", () => {
    const message = "at render (/src/sales/sale-screen.tsx?t=1727561234:10:5)";

    expect(scrubErrorReport({ message }).message).toBe(
      "at render (/src/sales/sale-screen.tsx?[redacted]:10:5)",
    );
  });

  it("hides a query that merely ends in two numbers when the path is not a script", () => {
    for (const { message, expected } of [
      {
        message: "GET /events?since=2026-09-28T10:30:00 failed",
        expected: "GET /events?[redacted] failed",
      },
      {
        message: "GET https://cloud.purosur.online/sales?at=10:30:45 failed",
        expected: "GET https://cloud.purosur.online/sales?[redacted] failed",
      },
      {
        message: "GET https://cloud.purosur.online/config.json?at=10:30:45 failed",
        expected: "GET https://cloud.purosur.online/config.json?[redacted] failed",
      },
    ]) {
      expect(scrubErrorReport({ message }).message).toBe(expected);
    }
  });

  it("gives the same text when an already scrubbed stack is scrubbed again", () => {
    const stack = [
      "Error: no customer for ana.perez@example.com",
      "    at render (http://localhost:5173/src/sale-screen.tsx?t=1:10:5)",
      "    at load (/src/sales/load.ts?t=1:3:7)",
      "    at start (/home/ana/purosur/main.js:10:5)",
      String.raw`    at start (C:\Users\Juan Perez\AppData\main.js:10:5)`,
    ].join("\n");

    const once = scrubErrorReport({ message: stack }).message;

    expect(scrubErrorReport({ message: once }).message).toBe(once);
  });

  it("keeps the frame's own line and column when the script's query also holds numbers", () => {
    for (const { frame, expected } of [
      {
        frame: "at render (http://localhost:5173/src/sale-screen.tsx?at=10:30:45&t=1:10:15)",
        expected: "at render (http://localhost:5173/src/sale-screen.tsx?[redacted]:10:15)",
      },
      {
        frame: "render@http://localhost:5173/src/sale-screen.tsx?t=1:10:15",
        expected: "render@http://localhost:5173/src/sale-screen.tsx?[redacted]:10:15",
      },
      {
        frame: "at start (/app/dist/main.mjs?t=1:3:7)",
        expected: "at start (/app/dist/main.mjs?[redacted]:3:7)",
      },
    ]) {
      expect(scrubErrorReport({ message: frame }).message).toBe(expected);
    }
  });

  it("hides a script's query that carries no line and column", () => {
    const message = "at load (/src/sales/load.ts?t=1)";

    expect(scrubErrorReport({ message }).message).toBe("at load (/src/sales/load.ts?[redacted])");
  });

  it("keeps a stack frame's line and column after redacting its URL's query", () => {
    const message = "at render (http://localhost:5173/src/sales/sale-screen.tsx?t=1727561234:10:5)";

    expect(scrubErrorReport({ message }).message).toBe(
      "at render (http://localhost:5173/src/sales/sale-screen.tsx?[redacted]:10:5)",
    );
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
