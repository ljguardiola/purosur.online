import { pinCodeRedemptionAttemptWindowStart } from "@purosur/domain";
import type {
  HashedPin,
  LockedPinCode,
  PinCodeHolder,
  PinCodeRedemption,
  PinCodeRedemptionAttemptKey,
  PinCodeRedemptionStore,
  PinCodeRedemptionStoreTransaction,
} from "@purosur/domain/credentials/use-cases";
import { and, desc, eq, gt, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  auditLog,
  pinCodeRedemptionAttempts,
  userPinCodes,
  userPins,
  users,
} from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

function attemptKeyCondition(key: PinCodeRedemptionAttemptKey) {
  return and(
    eq(pinCodeRedemptionAttempts.keyKind, key.kind),
    eq(pinCodeRedemptionAttempts.keyValue, key.value),
  );
}

class DrizzlePinCodeRedemptionStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements PinCodeRedemptionStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;
  private readonly pending: PendingChanges;

  constructor(tx: Transaction<TQueryResult>, pending: PendingChanges) {
    this.tx = tx;
    this.pending = pending;
  }

  async findPinCodeHolder(codeHash: string): Promise<string | undefined> {
    const [row] = await this.tx
      .select({ userId: userPinCodes.userId })
      .from(userPinCodes)
      .where(eq(userPinCodes.codeHash, codeHash));
    return row?.userId;
  }

  async lockPinCodeHolder(userId: string): Promise<PinCodeHolder | undefined> {
    const [row] = await this.tx
      .select({ active: users.active })
      .from(users)
      .where(eq(users.id, userId))
      .for("no key update");
    return row;
  }

  async lockHeldPinCode(userId: string, codeHash: string): Promise<LockedPinCode | undefined> {
    const [row] = await this.tx
      .select({
        expiresAt: userPinCodes.expiresAt,
        redeemedAt: userPinCodes.redeemedAt,
        supersededAt: userPinCodes.supersededAt,
        failedAttempts: userPinCodes.failedAttempts,
      })
      .from(userPinCodes)
      .where(and(eq(userPinCodes.userId, userId), eq(userPinCodes.codeHash, codeHash)))
      .for("update");
    return row;
  }

  // Counters have no row of their own to lock before their first attempt, so each key takes a
  // transaction-scoped advisory lock instead, always in the same order to avoid deadlocks.
  async lockPinCodeRedemptionAttempts(keys: readonly PinCodeRedemptionAttemptKey[]): Promise<void> {
    const lockKeys = keys.map((key) => `pin_code_redemption:${key.kind}:${key.value}`).sort();
    for (const lockKey of lockKeys) {
      await this.tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    }
  }

  async acceptedPinCodeRedemptionAttempts(
    key: PinCodeRedemptionAttemptKey,
    since: Date,
  ): Promise<Date[]> {
    const rows = await this.tx
      .select({ attemptedAt: pinCodeRedemptionAttempts.attemptedAt })
      .from(pinCodeRedemptionAttempts)
      .where(and(attemptKeyCondition(key), gt(pinCodeRedemptionAttempts.attemptedAt, since)))
      .orderBy(desc(pinCodeRedemptionAttempts.attemptedAt));
    return rows.map((row) => row.attemptedAt);
  }

  async recordPinCodeRedemptionAttempt(
    keys: readonly PinCodeRedemptionAttemptKey[],
    attemptedAt: Date,
  ): Promise<void> {
    await this.tx
      .delete(pinCodeRedemptionAttempts)
      .where(
        lte(
          pinCodeRedemptionAttempts.attemptedAt,
          pinCodeRedemptionAttemptWindowStart(attemptedAt),
        ),
      );
    await this.tx
      .insert(pinCodeRedemptionAttempts)
      .values(keys.map((key) => ({ keyKind: key.kind, keyValue: key.value, attemptedAt })));
  }

  async recordFailedPinCodeRedemption(codeHash: string): Promise<void> {
    await this.tx
      .update(userPinCodes)
      .set({ failedAttempts: sql`${userPinCodes.failedAttempts} + 1` })
      .where(eq(userPinCodes.codeHash, codeHash));
  }

  async replacePin(userId: string, pin: HashedPin, changedAt: Date): Promise<void> {
    await this.tx
      .insert(userPins)
      .values({ userId, salt: pin.salt, hash: pin.pinHash, setAt: changedAt })
      .onConflictDoUpdate({
        target: userPins.userId,
        set: { salt: pin.salt, hash: pin.pinHash, setAt: changedAt },
      });
    // The register learns of the new PIN only through a newer version of the user.
    const [user] = await this.tx
      .update(users)
      .set({ version: sql`${users.version} + 1` })
      .where(eq(users.id, userId))
      .returning({ version: users.version, locationId: users.locationId });
    if (!user) {
      throw new Error("a replaced PIN had no user");
    }
    this.pending.note({
      entity: "user",
      entityId: userId,
      version: user.version,
      op: "update",
      locationId: user.locationId,
    });
  }

  async markPinCodeRedeemed(codeHash: string, redeemedAt: Date): Promise<void> {
    await this.tx
      .update(userPinCodes)
      .set({ redeemedAt })
      .where(eq(userPinCodes.codeHash, codeHash));
  }

  async recordPinCodeRedemption(redemption: PinCodeRedemption): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "user",
      entityId: redemption.userId,
      actorId: redemption.userId,
      newValue: {
        pin_code_redeemed_at: redemption.redeemedAt.toISOString(),
        register_id: redemption.registerId,
      },
      at: redemption.redeemedAt,
    });
  }
}

export class DrizzlePinCodeRedemptionStore<TQueryResult extends PgQueryResultHKT>
  implements PinCodeRedemptionStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: PinCodeRedemptionStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, undefined, (tx, pending) =>
      work(new DrizzlePinCodeRedemptionStoreTransaction(tx, pending)),
    );
  }
}
