import type {
  IssuedRecoveryToken,
  NewRecoveryToken,
  RecoveryAccount,
  RecoveryRequest,
  RecoveryRequestedAlert,
  RecoveryTokenStore,
  RecoveryTokenStoreTransaction,
  RejectedRecoveryRequest,
} from "@purosur/domain/credentials/use-cases";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../alerts/open-alert.js";
import { auditLog, recoveryTokens, users } from "../platform/db/schema.js";
import { voidOutstandingRecoveryTokens } from "./void-outstanding-recovery-tokens.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzleRecoveryTokenStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements RecoveryTokenStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;

  constructor(tx: Transaction<TQueryResult>) {
    this.tx = tx;
  }

  async findAccountByEmail(email: string): Promise<RecoveryAccount | undefined> {
    const [account] = await this.tx
      .select({ id: users.id, active: users.active })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return account;
  }

  async lockRecoveryTokens(userId: string): Promise<void> {
    await this.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`recovery_token:${userId}`}, 0))`,
    );
  }

  listRecoveryRequests(userId: string): Promise<RecoveryRequest[]> {
    return this.tx
      .select({ requestId: recoveryTokens.requestId, requestedAt: recoveryTokens.requestedAt })
      .from(recoveryTokens)
      .where(eq(recoveryTokens.userId, userId));
  }

  async recordRejectedRequest(rejection: RejectedRecoveryRequest): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "user",
      entityId: rejection.userId,
      actorId: rejection.userId,
      previousValue: null,
      newValue: { attempt: "request", rejectedWith: rejection.reason },
      at: rejection.requestedAt,
    });
  }

  voidOutstandingRecoveryTokens(userId: string, at: Date): Promise<void> {
    return voidOutstandingRecoveryTokens(this.tx, userId, at);
  }

  async issueToken(token: NewRecoveryToken): Promise<IssuedRecoveryToken> {
    const [issued] = await this.tx.insert(recoveryTokens).values(token).returning({
      id: recoveryTokens.id,
      issuedAt: recoveryTokens.issuedAt,
      expiresAt: recoveryTokens.expiresAt,
    });
    if (!issued) {
      throw new Error("inserting the recovery token returned no row");
    }
    return issued;
  }

  async recordIssuedToken(
    userId: string,
    token: IssuedRecoveryToken,
    requestedAt: Date,
  ): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "recovery_token",
      entityId: token.id,
      actorId: userId,
      previousValue: null,
      newValue: {
        issuedAt: token.issuedAt.toISOString(),
        expiresAt: token.expiresAt.toISOString(),
      },
      at: requestedAt,
    });
  }

  async openRecoveryRequestedAlert(alert: RecoveryRequestedAlert): Promise<void> {
    await openAlert(
      this.tx,
      {
        kind: "backoffice_recovery_requested",
        scope: alert.userId,
        detail: {
          requestedAt: alert.requestedAt.toISOString(),
          issuedAt: alert.issuedAt.toISOString(),
          expiresAt: alert.expiresAt.toISOString(),
        },
      },
      { now: () => alert.issuedAt },
    );
  }
}

export class DrizzleRecoveryTokenStore<TQueryResult extends PgQueryResultHKT>
  implements RecoveryTokenStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: RecoveryTokenStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleRecoveryTokenStoreTransaction(tx)));
  }
}
