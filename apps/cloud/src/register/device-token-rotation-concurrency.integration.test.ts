import { rotateDeviceToken } from "@purosur/domain/register/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerInstallations } from "../platform/db/schema.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { deviceTokenRotationPorts } from "./installation-token-ports.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";

const FIRST_ROTATION_AT = new Date("2026-09-29T12:00:00.000Z");
const SECOND_ROTATION_AT = new Date("2026-09-29T12:00:05.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("device_token_rotation_race");
  sql = postgres(integrationDb.databaseUrl, { max: 6 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function rotate(deviceToken: string, now: Date) {
  return rotateDeviceToken(
    deviceTokenRotationPorts({ db, rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY, now: () => now }),
    { deviceToken },
  );
}

// PGlite runs every query over one connection, so it can never race two rotations of the same
// installation; this runs them over a real multi-connection postgres-js pool instead.
describe("rotating the same device token twice at once on a real Postgres through postgres-js", () => {
  it("answers both the same new token and leaves the pending token the first one recorded", async () => {
    const { deviceId, deviceToken } = await insertEnrolledInstallation(db);

    const outcomes = await runQueuedBehindHeldLock(
      sql,
      (holder) => holder`select 1 from register_installations where id = ${deviceId} for update`,
      () => rotate(deviceToken, FIRST_ROTATION_AT),
      () => rotate(deviceToken, SECOND_ROTATION_AT),
    );

    const [first, second] = outcomes;
    expect(first.kind).toBe("rotated");
    expect(second).toEqual(first);
    const [installation] = await db
      .select({
        pendingPrefix: registerInstallations.pendingTokenLookupPrefix,
        pendingIssuedAt: registerInstallations.pendingTokenIssuedAt,
      })
      .from(registerInstallations)
      .where(eq(registerInstallations.id, deviceId));
    expect(installation).toEqual({
      pendingPrefix: first.kind === "rotated" ? first.deviceToken.split(".")[0] : undefined,
      pendingIssuedAt: FIRST_ROTATION_AT,
    });
  });
});
