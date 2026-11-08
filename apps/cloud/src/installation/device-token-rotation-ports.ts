import type { DeviceTokenRotationPorts } from "@purosur/domain/installation/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  type DeviceTokensOptions,
  installationTokenPorts,
} from "../platform/installation-token-ports.js";
import { generateInstallationKey } from "./installation-key.js";

export function deviceTokenRotationPorts<TQueryResult extends PgQueryResultHKT>(
  options: DeviceTokensOptions<TQueryResult>,
): DeviceTokenRotationPorts {
  return { ...installationTokenPorts(options), keys: { generate: generateInstallationKey } };
}
