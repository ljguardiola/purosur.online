import { randomUUID } from "node:crypto";
import { enrollmentAttemptWindowStart } from "@purosur/domain";
import type {
  EnrollmentAlert,
  EnrollmentAttemptKey,
  InstallationEnrollment,
  InstallationRevocation,
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
import {
  auditLog,
  registerContingencyTicketKeys,
  registerEnrollmentAttempts,
  registerEnrollmentCodes,
  registerInstallations,
  registerSnapshotKeys,
} from "../platform/db/schema.js";
import type { InstallationKeyCipher } from "./installation-key-cipher.js";
import { readOutboxChainKey, sealOutboxChainKey } from "./outbox-chain-key.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

function attemptKeyCondition(key: EnrollmentAttemptKey) {
  return and(
    eq(registerEnrollmentAttempts.keyKind, key.kind),
    eq(registerEnrollmentAttempts.keyValue, key.value),
  );
}

const replacedRevocationReason = "replaced";

const snapshotKeyPurpose = (registerId: string, version: number) =>
  `snapshot_key:${registerId}:${version}`;
const contingencyTicketKeyPurpose = (registerId: string, version: number) =>
  `contingency_ticket_key:${registerId}:${version}`;

class DrizzleRegisterStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements RegisterStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;
  private readonly cipher: InstallationKeyCipher;

  constructor(tx: Transaction<TQueryResult>, cipher: InstallationKeyCipher) {
    this.tx = tx;
    this.cipher = cipher;
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
  ): Promise<{ revokedDeviceId: string | null }> {
    const revoked = await this.tx
      .update(registerInstallations)
      .set({ revokedAt, revocationReason: replacedRevocationReason })
      .where(
        and(
          eq(registerInstallations.registerId, registerId),
          isNull(registerInstallations.revokedAt),
        ),
      )
      .returning({ id: registerInstallations.id });
    return { revokedDeviceId: revoked[0]?.id ?? null };
  }

  async recordInstallationRevocation(revocation: InstallationRevocation): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "register_installation",
      entityId: revocation.deviceId,
      actorId: null,
      previousValue: { revoked_at: null, revocation_reason: null },
      newValue: {
        register_id: revocation.registerId,
        revoked_at: revocation.revokedAt.toISOString(),
        revocation_reason: replacedRevocationReason,
      },
      at: revocation.revokedAt,
    });
  }

  async recordInstallation(installation: NewInstallation): Promise<{ deviceId: string }> {
    // The key is sealed for its installation, so the installation's id is chosen before the insert.
    const id = randomUUID();
    const [recorded] = await this.tx
      .insert(registerInstallations)
      .values({
        ...installation,
        id,
        outboxChainKey: sealOutboxChainKey(this.cipher, id, installation.outboxChainKey),
      })
      .returning({ id: registerInstallations.id });
    if (!recorded) {
      throw new Error("inserting the new installation returned no row");
    }
    return { deviceId: recorded.id };
  }

  async recordInstallationEnrollment(enrollment: InstallationEnrollment): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "register_installation",
      entityId: enrollment.deviceId,
      actorId: null,
      previousValue: null,
      newValue: {
        register_id: enrollment.registerId,
        hostname: enrollment.hostname,
        windows_version: enrollment.windowsVersion,
        enrolled_at: enrollment.enrolledAt.toISOString(),
        replaced_installation_id: enrollment.replacedDeviceId,
      },
      at: enrollment.enrolledAt,
    });
  }

  async lockInstallationByTokenPrefix(
    lookupPrefix: string,
  ): Promise<LockedInstallation | undefined> {
    const [row] = await this.tx
      .select({
        deviceId: registerInstallations.id,
        registerId: registerInstallations.registerId,
        revokedAt: registerInstallations.revokedAt,
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

  outboxChainKey(deviceId: string): Promise<string | undefined> {
    return readOutboxChainKey(this.tx, this.cipher, deviceId);
  }

  async recordOutboxChainKey(deviceId: string, outboxChainKey: string): Promise<void> {
    await this.tx
      .update(registerInstallations)
      .set({ outboxChainKey: sealOutboxChainKey(this.cipher, deviceId, outboxChainKey) })
      .where(eq(registerInstallations.id, deviceId));
  }

  // A register has no key row to lock before its first key, and locking its registers row would
  // take the register before its enrollment code, the reverse of what code emission does.
  async lockRegisterKeys(registerId: string): Promise<RegisterKeys> {
    await this.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`register_keys:${registerId}`}, 0))`,
    );
    const versionsOf = async (
      table: typeof registerSnapshotKeys,
      purpose: (registerId: string, version: number) => string,
    ): Promise<VersionedKey[]> => {
      const rows = await this.tx
        .select({ version: table.version, key: table.key })
        .from(table)
        .where(eq(table.registerId, registerId));
      return rows.map((row) => ({
        version: row.version,
        key: this.cipher.open(row.key, purpose(registerId, row.version)),
      }));
    };
    return {
      snapshotKeys: await versionsOf(registerSnapshotKeys, snapshotKeyPurpose),
      contingencyTicketKeys: await versionsOf(
        registerContingencyTicketKeys,
        contingencyTicketKeyPurpose,
      ),
    };
  }

  async recordSnapshotKey(registerId: string, key: VersionedKey): Promise<void> {
    await this.tx.insert(registerSnapshotKeys).values({
      registerId,
      version: key.version,
      key: this.cipher.seal(key.key, snapshotKeyPurpose(registerId, key.version)),
    });
  }

  async recordContingencyTicketKey(registerId: string, key: VersionedKey): Promise<void> {
    await this.tx.insert(registerContingencyTicketKeys).values({
      registerId,
      version: key.version,
      key: this.cipher.seal(key.key, contingencyTicketKeyPurpose(registerId, key.version)),
    });
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
  private readonly cipher: InstallationKeyCipher;

  constructor(db: PgDatabase<TQueryResult>, cipher: InstallationKeyCipher) {
    this.db = db;
    this.cipher = cipher;
  }

  transaction<TOutcome>(
    work: (tx: RegisterStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleRegisterStoreTransaction(tx, this.cipher)));
  }
}
