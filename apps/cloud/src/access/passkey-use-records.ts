import type { PasskeyUse, PasskeyUseRecording } from "@purosur/domain/credentials/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { passkeys } from "../platform/db/schema.js";

export async function recordPasskeyUse<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  use: PasskeyUse,
): Promise<PasskeyUseRecording> {
  const [used] = await tx
    .update(passkeys)
    .set({ lastUsedAt: use.at, counter: use.counter })
    .where(eq(passkeys.id, use.passkeyId))
    .returning({ id: passkeys.id });
  return used ? "recorded" : "passkey_removed";
}
