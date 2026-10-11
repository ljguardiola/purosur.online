import { FICTIONAL_CUIT, FICTIONAL_LEGAL_NAME } from "@purosur/domain/fiscal/test-support";
import * as Sentry from "@sentry/node";
import { DrizzleQueryError } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reportError } from "./error-reporting.js";
import { startRecordingSentry } from "./test-support/recording-sentry.js";

afterEach(async () => {
  await Sentry.close();
  vi.restoreAllMocks();
});

describe("reportError with a failed query", () => {
  it("sends none of the query's values, neither in the error nor in the breadcrumb its log line leaves", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const sentEnvelopes = startRecordingSentry();
    const driverError = Object.assign(
      new Error('duplicate key value violates unique constraint "customers_legal_name_key"'),
      { code: "23505", detail: `Key (legal_name)=(${FICTIONAL_LEGAL_NAME}) already exists.` },
    );

    reportError(
      "recovery: bookkeeping failed",
      new DrizzleQueryError(
        'insert into "customers" ("cuit", "legal_name") values ($1, $2)',
        [FICTIONAL_CUIT, FICTIONAL_LEGAL_NAME],
        driverError,
      ),
    );

    const [report, ...others] = await sentEnvelopes();
    expect(others).toHaveLength(0);
    expect(report).toContain('"category":"console"');
    expect(report).toContain(
      '"message":"recovery: bookkeeping failed Error: Failed query: insert into',
    );
    expect(report).not.toContain(FICTIONAL_CUIT);
    expect(report).not.toContain(FICTIONAL_LEGAL_NAME);
  });
});
