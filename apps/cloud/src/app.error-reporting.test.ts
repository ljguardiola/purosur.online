import { FICTIONAL_CUIT, FICTIONAL_LEGAL_NAME } from "@purosur/domain/fiscal/test-support";
import * as Sentry from "@sentry/node";
import { DrizzleQueryError } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { initSentry } from "./platform/sentry.js";
import { PUBLIC_ACCESS } from "./sessions/route-access.js";
import { buildTestApp } from "./test-support/build-test-app.js";

const STATEMENT = 'insert into "customers" ("cuit", "legal_name") values ($1, $2)';

function startRecordingSentry(): () => Promise<string[]> {
  const sent: string[] = [];
  initSentry(
    { dsn: "https://public@errors.example.test/1" },
    {
      init: (options) =>
        Sentry.init({
          ...options,
          transport: () => ({
            send: (envelope) => {
              sent.push(JSON.stringify(envelope));
              return Promise.resolve({});
            },
            flush: () => Promise.resolve(true),
          }),
        }),
    },
  );
  return async () => {
    await Sentry.flush();
    return sent;
  };
}

afterEach(async () => {
  await Sentry.close();
});

describe("an unhandled route error caused by a failed query", () => {
  it("reaches the error report with the query's statement but none of the values it was given", async () => {
    const sentEnvelopes = startRecordingSentry();
    const app = buildTestApp({
      now: () => new Date("2020-06-15T12:00:00.000Z"),
      version: "abc1234",
    });
    app.get("/customers", { config: { access: PUBLIC_ACCESS } }, async () => {
      throw new Error("saving the customer failed", {
        cause: new DrizzleQueryError(
          STATEMENT,
          [FICTIONAL_CUIT, FICTIONAL_LEGAL_NAME],
          new Error("connection reset"),
        ),
      });
    });

    const response = await app.inject({ method: "GET", url: "/customers" });

    expect(response.statusCode).toBe(500);
    const [report, ...others] = await sentEnvelopes();
    expect(others).toHaveLength(0);
    expect(report).toContain("saving the customer failed");
    expect(report).toContain(`Failed query: ${STATEMENT}`.replaceAll('"', '\\"'));
    expect(report).toContain("connection reset");
    expect(report).not.toContain(FICTIONAL_CUIT);
    expect(report).not.toContain(FICTIONAL_LEGAL_NAME);
  });
});
