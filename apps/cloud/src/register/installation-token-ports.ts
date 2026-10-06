import type {
  DeviceTokenRotationPorts,
  InstallationTokenPorts,
} from "@purosur/domain/register/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { deviceTokenRotator } from "./device-token.js";
import { DrizzleRegisterStore } from "./drizzle-register-store.js";
import { generateInstallationKey } from "./installation-key.js";
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

export function deviceTokenRotationPorts<TQueryResult extends PgQueryResultHKT>(
  options: DeviceTokensOptions<TQueryResult>,
): DeviceTokenRotationPorts {
  return { ...installationTokenPorts(options), keys: { generate: generateInstallationKey } };
}
