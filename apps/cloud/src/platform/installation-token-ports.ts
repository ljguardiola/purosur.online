import type { InstallationTokenPorts } from "@purosur/domain/installation/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { deviceTokenRotator } from "../installation/device-token.js";
import { DrizzleRegisterStore } from "../installation/drizzle-register-store.js";
import { installationKeyCipher } from "./installation-key-cipher.js";

export interface DeviceTokensOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  rotationKey: Uint8Array;
  keysEncryptionKey: Uint8Array;
  now: () => Date;
}

export function installationTokenPorts<TQueryResult extends PgQueryResultHKT>(
  options: DeviceTokensOptions<TQueryResult>,
): InstallationTokenPorts {
  return {
    store: new DrizzleRegisterStore(options.db, installationKeyCipher(options.keysEncryptionKey)),
    clock: { now: options.now },
    tokens: deviceTokenRotator(options.rotationKey),
  };
}
