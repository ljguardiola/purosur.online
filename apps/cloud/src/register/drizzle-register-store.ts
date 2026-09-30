import { enrollmentAttemptWindowStart } from "@purosur/domain";
import type {
  EnrollmentAlert,
  EnrollmentAttemptKey,
  LockedEnrollmentCode,
  LockedInstallation,
  NewInstallation,
  RegisterKeys,
  RegisterStore,
  RegisterStoreTransaction,
  StoredDeviceToken,
  VersionedKey,
} from "@purosur/domain/register/use-cases";
import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../alerts/open-alert.js";
import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";
import {
  registerContingencyTicketKeys,
  registerEnrollmentAttempts,
  registerEnrollmentCodes,
  registerInstallations,
  registerSnapshotKeys,
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

// A failed query's error, and the driver's error under it, carry the query's parameters and go on
// to error reporting, so a write carrying a key raises one that keeps only the Postgres error code
// and constraint.
async function writingKey<T>(write: PromiseLike<T>): Promise<T> {
  try {
    return await write;
  } catch (error) {
    const [driverError] = postgresErrorChain(error).filter((link) => link.code !== undefined);
    throw Object.assign(new Error("writing an installation key failed"), driverError);
  }
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
    const [recorded] = await writingKey(
      this.tx
        .insert(registerInstallations)
        .values(installation)
        .returning({ id: registerInstallations.id }),
    );
    if (!recorded) {
      throw new Error("inserting the new installation returned no row");
    }
    return { deviceId: recorded.id };
  }

  async lockInstallationByTokenPrefix(
    lookupPrefix: string,
  ): Promise<LockedInstallation | undefined> {
    const [row] = await this.tx
      .select({
        deviceId: registerInstallations.id,
        registerId: registerInstallations.registerId,
        revokedAt: registerInstallations.revokedAt,
        outboxChainKey: registerInstallations.outboxChainKey,
        tokenLookupPrefix: registerInstallations.tokenLookupPrefix,
        tokenHash: registerInstallations.tokenHash,
        tokenIssuedAt: registerInstallations.tokenIssuedAt,
        pendingTokenLookupPrefix: registerInstallations.pendingTokenLookupPrefix,
        pendingTokenHash: registerInstallations.pendingTokenHash,
        pendingTokenIssuedAt: registerInstallations.pendingTokenIssuedAt,
      })
      .from(registerInstallations)
      .where(
        or(
          eq(registerInstallations.tokenLookupPrefix, lookupPrefix),
          eq(registerInstallations.pendingTokenLookupPrefix, lookupPrefix),
        ),
      )
      .for("update");
    if (!row) {
      return undefined;
    }
    const { pendingTokenLookupPrefix, pendingTokenHash, pendingTokenIssuedAt } = row;
    return {
      deviceId: row.deviceId,
      registerId: row.registerId,
      revoked: row.revokedAt !== null,
      outboxChainKey: row.outboxChainKey ?? undefined,
      currentToken: {
        lookupPrefix: row.tokenLookupPrefix,
        tokenHash: row.tokenHash,
        issuedAt: row.tokenIssuedAt,
      },
      pendingToken:
        pendingTokenLookupPrefix !== null &&
        pendingTokenHash !== null &&
        pendingTokenIssuedAt !== null
          ? {
              lookupPrefix: pendingTokenLookupPrefix,
              tokenHash: pendingTokenHash,
              issuedAt: pendingTokenIssuedAt,
            }
          : undefined,
    };
  }

  async promotePendingDeviceToken(deviceId: string): Promise<void> {
    await this.tx
      .update(registerInstallations)
      .set({
        tokenLookupPrefix: sql`${registerInstallations.pendingTokenLookupPrefix}`,
        tokenHash: sql`${registerInstallations.pendingTokenHash}`,
        tokenIssuedAt: sql`${registerInstallations.pendingTokenIssuedAt}`,
        pendingTokenLookupPrefix: null,
        pendingTokenHash: null,
        pendingTokenIssuedAt: null,
      })
      .where(eq(registerInstallations.id, deviceId));
  }

  async recordPendingDeviceToken(deviceId: string, token: StoredDeviceToken): Promise<void> {
    await this.tx
      .update(registerInstallations)
      .set({
        pendingTokenLookupPrefix: token.lookupPrefix,
        pendingTokenHash: token.tokenHash,
        pendingTokenIssuedAt: token.issuedAt,
      })
      .where(eq(registerInstallations.id, deviceId));
  }

  async recordOutboxChainKey(deviceId: string, outboxChainKey: string): Promise<void> {
    await writingKey(
      this.tx
        .update(registerInstallations)
        .set({ outboxChainKey })
        .where(eq(registerInstallations.id, deviceId)),
    );
  }

  // A register has no key row to lock before its first key, and locking its registers row would
  // take the register before its enrollment code, the reverse of what code emission does.
  async lockRegisterKeys(registerId: string): Promise<RegisterKeys> {
    await this.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`register_keys:${registerId}`}, 0))`,
    );
    const versionsOf = (table: typeof registerSnapshotKeys) =>
      this.tx
        .select({ version: table.version, key: table.key })
        .from(table)
        .where(eq(table.registerId, registerId));
    return {
      snapshotKeys: await versionsOf(registerSnapshotKeys),
      contingencyTicketKeys: await versionsOf(registerContingencyTicketKeys),
    };
  }

  async recordSnapshotKey(registerId: string, key: VersionedKey): Promise<void> {
    await writingKey(this.tx.insert(registerSnapshotKeys).values({ registerId, ...key }));
  }

  async recordContingencyTicketKey(registerId: string, key: VersionedKey): Promise<void> {
    await writingKey(this.tx.insert(registerContingencyTicketKeys).values({ registerId, ...key }));
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
