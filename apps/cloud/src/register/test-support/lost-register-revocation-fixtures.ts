import { revokeLostRegister } from "@purosur/domain/register/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { locations, userPins, users } from "../../platform/db/schema.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../../test-support/installation-keys-encryption-key.js";
import { DrizzleLostRegisterRevocationStore } from "../drizzle-lost-register-revocation-store.js";
import { generateInstallationKey } from "../installation-key.js";
import { installationKeyCipher } from "../installation-key-cipher.js";
import { keyStore } from "./key-store.js";

export const REVOKED_AT = new Date("2026-10-16T12:00:00.000Z");

export async function insertUserWithPin<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: { firstName: string; locationId: string; withPin?: boolean },
): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      firstName: input.firstName,
      email: `${input.firstName.toLowerCase()}@example.com`,
      locationId: input.locationId,
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  if (input.withPin ?? true) {
    await db.insert(userPins).values({
      userId: user.id,
      salt: "salt",
      hash: "hash",
      setAt: new Date("2026-10-01T12:00:00.000Z"),
    });
  }
  return user.id;
}

export async function insertOtherLocation<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<string> {
  const [location] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!location) {
    throw new Error("test setup: seeding the other location returned no row");
  }
  return location.id;
}

export async function insertFirstKeys<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  registerId: string,
): Promise<{ snapshotKey: string; contingencyTicketKey: string }> {
  const snapshotKey = generateInstallationKey();
  const contingencyTicketKey = generateInstallationKey();
  await keyStore(db).transaction(async (tx) => {
    await tx.lockRegisterKeys(registerId);
    await tx.recordSnapshotKey(registerId, { version: 1, key: snapshotKey });
    await tx.recordContingencyTicketKey(registerId, { version: 1, key: contingencyTicketKey });
  });
  return { snapshotKey, contingencyTicketKey };
}

export function revokeRegister<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: { branchId: string; registerId: string; actorId: string },
  now: Date = REVOKED_AT,
) {
  return revokeLostRegister(
    {
      store: new DrizzleLostRegisterRevocationStore(
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
