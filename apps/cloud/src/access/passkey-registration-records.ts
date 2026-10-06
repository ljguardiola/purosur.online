import {
  PasskeyAlreadyRegistered,
  type RecoveredPasskey,
  type RegisteredPasskey,
} from "@purosur/domain/access/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../alerts/open-alert.js";
import { auditLog, passkeys } from "../platform/db/schema.js";

export async function addPasskey<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  passkey: RecoveredPasskey,
  createdAt: Date,
): Promise<RegisteredPasskey & { createdAt: Date }> {
  const [added] = await tx
    .insert(passkeys)
    .values({ ...passkey, createdAt })
    .onConflictDoNothing({ target: passkeys.credentialId })
    .returning({ id: passkeys.id, createdAt: passkeys.createdAt });
  if (!added) {
    throw new PasskeyAlreadyRegistered();
  }
  return added;
}

export async function recordPasskeyRegistered<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  userId: string,
  passkey: RegisteredPasskey,
  details: RecoveredPasskey,
  at: Date,
): Promise<void> {
  await tx.insert(auditLog).values({
    entity: "passkey",
    entityId: passkey.id,
    actorId: userId,
    previousValue: null,
    newValue: {
      id: passkey.id,
      name: details.name,
      credentialId: details.credentialId,
      deviceType: details.deviceType,
      backedUp: details.backedUp,
    },
    at,
  });
}

export async function openPasskeyRegisteredAlert<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  alert: { userId: string; passkeyName: string; openedAt: Date },
  via: "self" | "recovery",
): Promise<void> {
  await openAlert(
    tx,
    {
      kind: "backoffice_passkey_changed",
      scope: alert.userId,
      detail: {
        action: "registered",
        passkeyName: alert.passkeyName,
        actorId: alert.userId,
        via,
      },
    },
    { now: () => alert.openedAt },
  );
}
