import postgres from "postgres";
import { expect, inject, it } from "vitest";

// The pools every integration file can open at once add up to about 300 (see
// vitest.global-setup.postgres.ts); this leaves headroom above that for non-superuser roles.
const PEAK_CONNECTIONS_WITH_MARGIN = 400;

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
