import {
  removeEveryUserPasskey,
  requirePinResetOfEveryUser,
} from "@purosur/domain/credentials/use-cases";
import { revokeEveryInstallation } from "@purosur/domain/register/use-cases";
import {
  type CompromiseResponseActions,
  endEveryBackofficeSession,
} from "@purosur/domain/sessions/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzlePasskeyHolders } from "../credentials/drizzle-passkey-holders.js";
import { DrizzlePasskeyRemovalStore } from "../credentials/drizzle-passkey-removal-store.js";
import { DrizzlePinResetStore } from "../credentials/drizzle-pin-reset-store.js";
import { DrizzleEveryInstallationRevocationStore } from "../register/drizzle-every-installation-revocation-store.js";
import { generateInstallationKey } from "../register/installation-key.js";
import { installationKeyCipher } from "../register/installation-key-cipher.js";
import { DrizzleBackofficeSessionEndingStore } from "./drizzle-backoffice-session-ending-store.js";
import type { OpenSession } from "./open-session.js";

export interface CompromiseResponseActionsOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  keysEncryptionKey: Uint8Array;
  now: () => Date;
}

export function compromiseResponseActions<TQueryResult extends PgQueryResultHKT>(
  { db, keysEncryptionKey, now }: CompromiseResponseActionsOptions<TQueryResult>,
  session: Pick<OpenSession, "userId" | "locationId" | "passkeyAuthorizedAt">,
  at: Date,
): CompromiseResponseActions {
  return {
    revokeEveryInstallation: () =>
      revokeEveryInstallation(
        {
          store: new DrizzleEveryInstallationRevocationStore(
            db,
            installationKeyCipher(keysEncryptionKey),
            now,
          ),
          clock: { now: () => at },
          keys: { generate: generateInstallationKey },
        },
        { actorId: session.userId },
      ),
    removeAccountPasskeys: (accountId) =>
      removeEveryUserPasskey(
        { store: new DrizzlePasskeyRemovalStore(db, now), holders: drizzlePasskeyHolders(db) },
        {
          locationId: session.locationId,
          administratorId: session.userId,
          targetUserId: accountId,
          passkeyAuthorizedAt: session.passkeyAuthorizedAt,
          at,
        },
      ),
    endEveryBackofficeSession: () =>
      endEveryBackofficeSession(
        { store: new DrizzleBackofficeSessionEndingStore(db) },
        { actorId: session.userId, at },
      ),
    requirePinResetOfEveryUser: () =>
      requirePinResetOfEveryUser(
        { store: new DrizzlePinResetStore(db, now) },
        { actorId: session.userId },
      ),
  };
}
