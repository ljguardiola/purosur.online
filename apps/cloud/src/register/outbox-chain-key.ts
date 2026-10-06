import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registerInstallations } from "../platform/db/schema.js";
import type { InstallationKeyCipher } from "./installation-key-cipher.js";

const outboxChainKeyPurpose = (deviceId: string) => `outbox_chain_key:${deviceId}`;

export function sealOutboxChainKey(
  cipher: InstallationKeyCipher,
  deviceId: string,
  outboxChainKey: string,
): string {
  return cipher.seal(outboxChainKey, outboxChainKeyPurpose(deviceId));
}

export async function readOutboxChainKey<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  cipher: InstallationKeyCipher,
  deviceId: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ outboxChainKey: registerInstallations.outboxChainKey })
    .from(registerInstallations)
    .where(eq(registerInstallations.id, deviceId));
  if (!row || row.outboxChainKey === null) {
    return undefined;
  }
  return cipher.open(row.outboxChainKey, outboxChainKeyPurpose(deviceId));
}
