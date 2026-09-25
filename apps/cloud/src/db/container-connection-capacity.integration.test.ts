import postgres from "postgres";
import { expect, inject, it } from "vitest";

// Every `*.integration.test.ts` file shares the one container and they run in parallel, each with
// its own pool (the widest is `sign-in-lockout-concurrency`'s 80). When all of them overlap they
// hold about 250 connections at once, so the container must leave room for more than that to
// non-superuser roles like `cloud_app`, or whichever file loses the race fails with 53300.
const PEAK_CONNECTIONS_WITH_MARGIN = 300;

it("leaves room for every integration file's pool to be open at once", async () => {
  const admin = postgres(inject("recoveryPostgresAdminUrl"), { max: 1 });
  try {
    const [row] = await admin<{ available: number }[]>`
      SELECT current_setting('max_connections')::int
        - current_setting('superuser_reserved_connections')::int
        - current_setting('reserved_connections')::int AS available
    `;
    expect(row?.available).toBeGreaterThanOrEqual(PEAK_CONNECTIONS_WITH_MARGIN);
  } finally {
    await admin.end({ timeout: 1 });
  }
});
