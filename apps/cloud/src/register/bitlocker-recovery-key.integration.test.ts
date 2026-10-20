import { loadBitlockerRecoveryKey } from "@purosur/domain/register/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerInstallationBitlockerKeys } from "../platform/db/schema.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { DrizzleBitlockerRecoveryKeyStore } from "./drizzle-bitlocker-recovery-key-store.js";
import { installationKeyCipher } from "./installation-key-cipher.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";
import { insertUserWithPin } from "./test-support/lost-register-revocation-fixtures.js";

const LOADED_AT = new Date("2026-10-19T12:00:00.000Z");
const FIRST_KEY = "000011-000022-000033-000044-000055-000066-000077-000088";
const SECOND_KEY = "000099-000099-000099-000099-000099-000099-000099-000099";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
const cipher = installationKeyCipher(TEST_INSTALLATION_KEYS_ENCRYPTION_KEY);

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("bitlocker_recovery_key");
  sql = postgres(integrationDb.databaseUrl, { max: 6 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function load(
  input: { branchId: string; registerId: string; actorId: string },
  recoveryKey: string,
) {
  return loadBitlockerRecoveryKey(
    { store: new DrizzleBitlockerRecoveryKeyStore(db, cipher), clock: { now: () => LOADED_AT } },
    { ...input, recoveryKey, keyIdentifier: "8F3A2C1D" },
  );
}

describe("loading a BitLocker recovery key on a real Postgres", () => {
  it("lets one of two concurrent loads of the same register store its key and answers the other already loaded", async () => {
    const { registerId, locationId, deviceId } = await insertEnrolledInstallation(db, {
      now: LOADED_AT,
    });
    const actorId = await insertUserWithPin(db, { firstName: "Ada", locationId });
    const input = { branchId: locationId, registerId, actorId };

    const [first, second] = await runQueuedBehindHeldLock(
      sql,
      (holder) => holder`select id from register_installations where id = ${deviceId} for update`,
      () => load(input, FIRST_KEY),
      () => load(input, SECOND_KEY),
    );

    expect([first.kind, second.kind].sort()).toEqual(["already_loaded", "loaded"]);
    const stored = await db.select().from(registerInstallationBitlockerKeys);
    expect(stored).toHaveLength(1);
    expect(cipher.open(stored[0]?.sealedKey ?? "", `bitlocker-recovery-key:${deviceId}`)).toBe(
      first.kind === "loaded" ? FIRST_KEY : SECOND_KEY,
    );
  });
});
