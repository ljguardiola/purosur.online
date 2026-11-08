import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { installationKeyCipher } from "../../platform/installation-key-cipher.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../../test-support/installation-keys-encryption-key.js";
import { DrizzleRegisterStore } from "../drizzle-register-store.js";

export function keyStore<TQueryResult extends PgQueryResultHKT>(db: PgDatabase<TQueryResult>) {
  return new DrizzleRegisterStore(db, installationKeyCipher(TEST_INSTALLATION_KEYS_ENCRYPTION_KEY));
}
