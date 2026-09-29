import { enrollmentAttemptWindowStart } from "@purosur/domain";
import type {
  EnrollmentAlert,
  EnrollmentAttemptKey,
  LockedEnrollmentCode,
  NewInstallation,
  RegisterStore,
  RegisterStoreTransaction,
} from "@purosur/domain/register/use-cases";
import { and, asc, desc, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../alerts/open-alert.js";
import {
  registerEnrollmentAttempts,
  registerEnrollmentCodes,
  registerInstallations,
} from "../platform/db/schema.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

function attemptKeyCondition(key: EnrollmentAttemptKey) {
  return and(
    eq(registerEnrollmentAttempts.keyKind, key.kind),
    eq(registerEnrollmentAttempts.keyValue, key.value),
  );
}

class DrizzleRegisterStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements RegisterStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;

  constructor(tx: Transaction<TQueryResult>) {
    this.tx = tx;
  }

  async lockEnrollmentCodes(lookup: string): Promise<LockedEnrollmentCode[]> {
    return this.tx
      .select({
        registerId: registerEnrollmentCodes.registerId,
        codeHash: registerEnrollmentCodes.codeHash,
        expiresAt: registerEnrollmentCodes.expiresAt,
        redeemedAt: registerEnrollmentCodes.redeemedAt,
        failedAttempts: registerEnrollmentCodes.failedAttempts,
      })
      .from(registerEnrollmentCodes)
      .where(eq(registerEnrollmentCodes.codeLookup, lookup))
      .orderBy(asc(registerEnrollmentCodes.registerId))
      .for("update");
  }

  // Counters have no row of their own to lock before their first attempt, so each key takes a
  // transaction-scoped advisory lock instead, always in the same order to avoid deadlocks.
  async lockEnrollmentAttempts(keys: readonly EnrollmentAttemptKey[]): Promise<void> {
    const lockKeys = keys.map((key) => `register_enrollment:${key.kind}:${key.value}`).sort();
    for (const lockKey of lockKeys) {
      await this.tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    }
  }

  async acceptedEnrollmentAttempts(key: EnrollmentAttemptKey, since: Date): Promise<Date[]> {
    const rows = await this.tx
      .select({ attemptedAt: registerEnrollmentAttempts.attemptedAt })
      .from(registerEnrollmentAttempts)
      .where(and(attemptKeyCondition(key), gt(registerEnrollmentAttempts.attemptedAt, since)))
      .orderBy(desc(registerEnrollmentAttempts.attemptedAt));
    return rows.map((row) => row.attemptedAt);
  }

  async recordEnrollmentAttempt(
    keys: readonly EnrollmentAttemptKey[],
    attemptedAt: Date,
  ): Promise<void> {
    await this.tx
      .delete(registerEnrollmentAttempts)
      .where(
        lte(registerEnrollmentAttempts.attemptedAt, enrollmentAttemptWindowStart(attemptedAt)),
      );
    await this.tx
      .insert(registerEnrollmentAttempts)
      .values(keys.map((key) => ({ keyKind: key.kind, keyValue: key.value, attemptedAt })));
  }

  async recordFailedEnrollmentAttempt(registerIds: readonly string[]): Promise<void> {
    await this.tx
      .update(registerEnrollmentCodes)
      .set({ failedAttempts: sql`${registerEnrollmentCodes.failedAttempts} + 1` })
      .where(inArray(registerEnrollmentCodes.registerId, [...registerIds]));
  }

  async revokeActiveInstallation(
    registerId: string,
    revokedAt: Date,
  ): Promise<{ revoked: boolean }> {
    const revoked = await this.tx
      .update(registerInstallations)
      .set({ revokedAt })
      .where(
        and(
          eq(registerInstallations.registerId, registerId),
          isNull(registerInstallations.revokedAt),
        ),
      )
      .returning({ id: registerInstallations.id });
    return { revoked: revoked.length > 0 };
  }

  async recordInstallation(installation: NewInstallation): Promise<{ deviceId: string }> {
    const [recorded] = await this.tx
      .insert(registerInstallations)
      .values(installation)
      .returning({ id: registerInstallations.id });
    if (!recorded) {
      throw new Error("inserting the new installation returned no row");
    }
    return { deviceId: recorded.id };
  }

  async markEnrollmentCodeRedeemed(registerId: string, redeemedAt: Date): Promise<void> {
    await this.tx
      .update(registerEnrollmentCodes)
      .set({ redeemedAt })
      .where(eq(registerEnrollmentCodes.registerId, registerId));
  }

  async openEnrollmentAlert(alert: EnrollmentAlert): Promise<void> {
    await openAlert(
      this.tx,
      {
        kind: "register_enrolled",
        scope: alert.registerId,
        detail: {
          deviceId: alert.deviceId,
          hostname: alert.hostname,
          windowsVersion: alert.windowsVersion,
          replacedInstallation: alert.replacedInstallation,
        },
      },
      { now: () => alert.enrolledAt },
    );
  }
}

export class DrizzleRegisterStore<TQueryResult extends PgQueryResultHKT> implements RegisterStore {
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: RegisterStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleRegisterStoreTransaction(tx)));
  }
}
