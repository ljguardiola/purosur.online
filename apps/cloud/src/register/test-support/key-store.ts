import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../../test-support/installation-keys-encryption-key.js";
import { DrizzleRegisterStore } from "../drizzle-register-store.js";
import { installationKeyCipher } from "../installation-key-cipher.js";

export function keyStore<TQueryResult extends PgQueryResultHKT>(db: PgDatabase<TQueryResult>) {
  return new DrizzleRegisterStore(db, installationKeyCipher(TEST_INSTALLATION_KEYS_ENCRYPTION_KEY));
}
