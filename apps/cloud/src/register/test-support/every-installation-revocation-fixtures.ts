import { revokeEveryInstallation } from "@purosur/domain/register/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registers } from "../../platform/db/schema.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../../test-support/installation-keys-encryption-key.js";
import { seededLocationId } from "../../test-support/seeded-location.js";
import { DrizzleEveryInstallationRevocationStore } from "../drizzle-every-installation-revocation-store.js";
import { generateInstallationKey } from "../installation-key.js";
import { installationKeyCipher } from "../installation-key-cipher.js";
import { type EnrolledInstallation, insertEnrolledInstallation } from "./enrolled-installation.js";
import {
  insertFirstKeys,
  insertOtherLocation,
  insertUserWithPin,
  REVOKED_AT,
} from "./lost-register-revocation-fixtures.js";

export function revokeEveryRegister<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: { actorId: string },
  now: Date = REVOKED_AT,
) {
  return revokeEveryInstallation(
    {
      store: new DrizzleEveryInstallationRevocationStore(
        db,
        installationKeyCipher(TEST_INSTALLATION_KEYS_ENCRYPTION_KEY),
        () => now,
      ),
      clock: { now: () => now },
      keys: { generate: generateInstallationKey },
    },
    input,
  );
}

let actorCount = 0;

export async function seedActor<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<string> {
  actorCount += 1;
  return insertUserWithPin(db, {
    firstName: `Ada${actorCount}`,
    locationId: await seededLocationId(db),
  });
}

export interface SeededRegister extends EnrolledInstallation {
  keys: { snapshotKey: string; contingencyTicketKey: string };
}

export async function seedRegisterWithKeys<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  options: { registerName: string; inOtherBranch?: boolean; revoked?: boolean },
): Promise<SeededRegister> {
  const existingRegisterId = options.inOtherBranch
    ? await insertRegisterInNewBranch(db, options.registerName)
    : undefined;
  const installation = await insertEnrolledInstallation(db, {
    now: REVOKED_AT,
    registerName: options.registerName,
    ...(existingRegisterId === undefined ? {} : { existingRegisterId }),
    ...(options.revoked ? { revokedAt: new Date("2026-10-01T12:00:00.000Z") } : {}),
  });
  const keys = await insertFirstKeys(db, installation.registerId);
  return { ...installation, keys };
}

async function insertRegisterInNewBranch<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  name: string,
): Promise<string> {
  const locationId = await insertOtherLocation(db);
  const [register] = await db
    .insert(registers)
    .values({ locationId, name })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register of another branch returned no row");
  }
  return register.id;
}
