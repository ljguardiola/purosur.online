import type { InstallationTokenPorts } from "@purosur/domain/register/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { deviceTokenRotator } from "./device-token.js";
import { DrizzleRegisterStore } from "./drizzle-register-store.js";

export interface DeviceTokensOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  rotationKey: Uint8Array;
  now?: () => Date;
}

export function installationTokenPorts<TQueryResult extends PgQueryResultHKT>(
  options: DeviceTokensOptions<TQueryResult>,
): InstallationTokenPorts {
  return {
    store: new DrizzleRegisterStore(options.db),
    clock: { now: options.now ?? (() => new Date()) },
    tokens: deviceTokenRotator(options.rotationKey),
  };
}
