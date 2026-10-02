import type {
  RecoveredPasskey,
  RecoveringAccount,
  RecoveryPasskeyAlert,
  RecoveryRedemptionStore,
  RecoveryRedemptionStoreTransaction,
  RecoveryTokenRecord,
  RegisteredCredential,
  RegisteredPasskey,
  RejectedRedemption,
} from "@purosur/domain/access/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog, passkeys, recoveryTokens, users } from "../platform/db/schema.js";
import {
  addPasskey,
  openPasskeyRegisteredAlert,
  recordPasskeyRegistered,
} from "./passkey-registration-records.js";
import { revokeSessions } from "./revoke-sessions.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

const TOKEN_COLUMNS = {
  id: recoveryTokens.id,
  userId: recoveryTokens.userId,
  expiresAt: recoveryTokens.expiresAt,
  usedAt: recoveryTokens.usedAt,
  voidedAt: recoveryTokens.voidedAt,
  registrationChallenge: recoveryTokens.registrationChallenge,
};

function rejectionCode(rejectedWith: RejectedRedemption["rejectedWith"]): string {
  switch (rejectedWith) {
    case "invalid":
    case "burned":
    case "expired":
      return `recovery_token_${rejectedWith}`;
    case "validation_failed":
    case "passkey_already_registered":
      return rejectedWith;
  }
}

class DrizzleRecoveryRedemptionStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements RecoveryRedemptionStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;

  constructor(tx: Transaction<TQueryResult>) {
    this.tx = tx;
  }

  async lockToken(tokenId: string): Promise<RecoveryTokenRecord | undefined> {
    const [token] = await this.tx
      .select(TOKEN_COLUMNS)
      .from(recoveryTokens)
      .where(eq(recoveryTokens.id, tokenId))
      .for("update");
    return token;
  }

  async markTokenUsed(tokenId: string, at: Date): Promise<void> {
    await this.tx.update(recoveryTokens).set({ usedAt: at }).where(eq(recoveryTokens.id, tokenId));
  }

  async registerPasskey(passkey: RecoveredPasskey): Promise<RegisteredPasskey> {
    const { id } = await addPasskey(this.tx, passkey);
    return { id };
  }

  async recordTokenRedeemed(tokenId: string, userId: string, at: Date): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "recovery_token",
      entityId: tokenId,
      actorId: userId,
      previousValue: null,
      newValue: { usedAt: at.toISOString() },
    });
  }

  recordPasskeyRegistered(
    userId: string,
    passkey: RegisteredPasskey,
    details: RecoveredPasskey,
  ): Promise<void> {
    return recordPasskeyRegistered(this.tx, userId, passkey, details);
  }

  openPasskeyRegisteredAlert(alert: RecoveryPasskeyAlert): Promise<void> {
    return openPasskeyRegisteredAlert(this.tx, alert, "recovery");
  }

  revokeSessions(userId: string, at: Date): Promise<void> {
    return revokeSessions(this.tx, userId, at);
  }
}

export class DrizzleRecoveryRedemptionStore<TQueryResult extends PgQueryResultHKT>
  implements RecoveryRedemptionStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async findTokenByHash(tokenHash: string): Promise<RecoveryTokenRecord | undefined> {
    const [token] = await this.db
      .select(TOKEN_COLUMNS)
      .from(recoveryTokens)
      .where(eq(recoveryTokens.tokenHash, tokenHash))
      .limit(1);
    return token;
  }

  async findAccount(userId: string): Promise<RecoveringAccount | undefined> {
    const [account] = await this.db
      .select({
        id: users.id,
        firstName: users.firstName,
        email: users.email,
        active: users.active,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return account;
  }

  listRegisteredCredentials(userId: string): Promise<RegisteredCredential[]> {
    return this.db
      .select({ credentialId: passkeys.credentialId, transports: passkeys.transports })
      .from(passkeys)
      .where(eq(passkeys.userId, userId));
  }

  async recordRegistrationChallenge(tokenId: string, challenge: string): Promise<void> {
    await this.db
      .update(recoveryTokens)
      .set({ registrationChallenge: challenge })
      .where(eq(recoveryTokens.id, tokenId));
  }

  async recordRejectedRedemption(rejection: RejectedRedemption): Promise<void> {
    await this.db.insert(auditLog).values({
      entity: "recovery_token",
      entityId: rejection.tokenId,
      actorId: rejection.userId,
      previousValue: null,
      newValue: { attempt: rejection.attempt, rejectedWith: rejectionCode(rejection.rejectedWith) },
    });
  }

  transaction<TOutcome>(
    work: (tx: RecoveryRedemptionStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleRecoveryRedemptionStoreTransaction(tx)));
  }
}
