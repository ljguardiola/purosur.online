import { FICTIONAL_CUIT, FICTIONAL_LEGAL_NAME } from "@purosur/domain/fiscal/test-support";
import * as Sentry from "@sentry/node";
import { DrizzleQueryError } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { startRecordingSentry } from "./platform/test-support/recording-sentry.js";
import { PUBLIC_ACCESS } from "./sessions/route-access.js";
import { buildTestApp } from "./test-support/build-test-app.js";

const STATEMENT = 'insert into "customers" ("cuit", "legal_name") values ($1, $2)';

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
    const { events, everything } = await sentEnvelopes();
    expect(events).toHaveLength(1);
    const [report] = events;
    expect(report).toContain("saving the customer failed");
    expect(report).toContain(`Failed query: ${STATEMENT}`.replaceAll('"', '\\"'));
    expect(report).toContain("connection reset");
    expect(everything).not.toContain(FICTIONAL_CUIT);
    expect(everything).not.toContain(FICTIONAL_LEGAL_NAME);
  });

  it("reaches the error report without a value the database echoed in the error that failed the query", async () => {
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
          new Error(`invalid input syntax for type uuid: "${FICTIONAL_LEGAL_NAME}"`),
        ),
      });
    });

    const response = await app.inject({ method: "GET", url: "/customers" });

    expect(response.statusCode).toBe(500);
    const { events, everything } = await sentEnvelopes();
    expect(events).toHaveLength(1);
    const [report] = events;
    expect(report).toContain(`Failed query: ${STATEMENT}`.replaceAll('"', '\\"'));
    expect(report).toContain("invalid input syntax for type uuid");
    expect(everything).not.toContain(FICTIONAL_LEGAL_NAME);
  });
});
