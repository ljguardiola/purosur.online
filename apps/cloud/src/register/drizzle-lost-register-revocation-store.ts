import type {
  LostRegisterKeys,
  LostRegisterRevocation,
  LostRegisterRevocationAlert,
  LostRegisterRevocationStore,
  LostRegisterRevocationStoreTransaction,
  RevokedInstallation,
  VersionedKey,
} from "@purosur/domain/register/use-cases";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../alerts/open-alert.js";
import { removeUserPin } from "../credentials/remove-user-pin.js";
import {
  auditLog,
  registerContingencyTicketKeys,
  registerInstallations,
  registerSnapshotKeys,
  registers,
  userPins,
  users,
} from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";
import {
  contingencyTicketKeyPurpose,
  lockRegisterKeysOf,
  snapshotKeyPurpose,
} from "./drizzle-register-store.js";
import type { InstallationKeyCipher } from "./installation-key-cipher.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

const lostOrStolenRevocationReason = "lost_or_stolen";

class DrizzleLostRegisterRevocationTransaction<TQueryResult extends PgQueryResultHKT>
  implements LostRegisterRevocationStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;
  private readonly pending: PendingChanges;
  private readonly cipher: InstallationKeyCipher;
  private readonly now: () => Date;

  constructor(
    tx: Transaction<TQueryResult>,
    pending: PendingChanges,
    cipher: InstallationKeyCipher,
    now: () => Date,
  ) {
    this.tx = tx;
    this.pending = pending;
    this.cipher = cipher;
    this.now = now;
  }

  // NO KEY UPDATE leaves the foreign-key check of an enrollment redeeming this register's code free
  // to proceed, instead of deadlocking.
  async lockBranchRegister(branchId: string, registerId: string): Promise<boolean> {
    const [register] = await this.tx
      .select({ id: registers.id })
      .from(registers)
      .where(and(eq(registers.id, registerId), eq(registers.locationId, branchId)))
      .for("no key update");
    return register !== undefined;
  }

  async revokeActiveInstallation(
    registerId: string,
    revokedAt: Date,
  ): Promise<RevokedInstallation | null> {
    const [revoked] = await this.tx
      .update(registerInstallations)
      .set({ revokedAt, revocationReason: lostOrStolenRevocationReason })
      .where(
        and(
          eq(registerInstallations.registerId, registerId),
          isNull(registerInstallations.revokedAt),
        ),
      )
      .returning({
        deviceId: registerInstallations.id,
        hostname: registerInstallations.hostname,
        windowsVersion: registerInstallations.windowsVersion,
      });
    return revoked ?? null;
  }

  async lockRegisterKeys(registerId: string): Promise<LostRegisterKeys> {
    await lockRegisterKeysOf(this.tx, registerId);
    const snapshotRows = await this.tx
      .select({ version: registerSnapshotKeys.version, key: registerSnapshotKeys.key })
      .from(registerSnapshotKeys)
      .where(eq(registerSnapshotKeys.registerId, registerId));
    const contingencyRows = await this.tx
      .select({
        version: registerContingencyTicketKeys.version,
        key: registerContingencyTicketKeys.key,
      })
      .from(registerContingencyTicketKeys)
      .where(eq(registerContingencyTicketKeys.registerId, registerId));
    return {
      snapshotKeys: snapshotRows.map((row) => ({
        version: row.version,
        key: this.cipher.open(row.key, snapshotKeyPurpose(registerId, row.version)),
      })),
      contingencyTicketKeys: contingencyRows.map((row) => ({
        version: row.version,
        key: this.cipher.open(row.key, contingencyTicketKeyPurpose(registerId, row.version)),
      })),
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

  async requirePinResetOfBranchUsers(branchId: string): Promise<void> {
    const holders = await this.tx
      .select({ userId: userPins.userId, locationId: users.locationId })
      .from(userPins)
      .innerJoin(users, eq(users.id, userPins.userId))
      .where(eq(users.locationId, branchId))
      .orderBy(asc(userPins.userId));
    for (const { userId, locationId } of holders) {
      if (await removeUserPin(this.tx, this.pending, locationId, userId)) {
        await this.tx.insert(auditLog).values({
          entity: "user",
          entityId: userId,
          actorId: null,
          newValue: { pin_reset_required_by: "register_revocation" },
          at: this.now(),
        });
      }
    }
  }

  async openRevocationAlert(alert: LostRegisterRevocationAlert): Promise<void> {
    await openAlert(
      this.tx,
      {
        kind: "register_enrolled",
        scope: alert.registerId,
        detail: {
          change: "revoked",
          deviceId: alert.deviceId,
          hostname: alert.hostname,
          windowsVersion: alert.windowsVersion,
        },
      },
      { now: this.now },
    );
  }

  async recordLostRegisterRevocation(revocation: LostRegisterRevocation): Promise<void> {
    const { registerId, actorId, revokedAt } = revocation;
    await this.tx.insert(auditLog).values([
      {
        entity: "register_installation",
        entityId: revocation.deviceId,
        actorId,
        previousValue: { revoked_at: null, revocation_reason: null },
        newValue: {
          register_id: registerId,
          revoked_at: revokedAt.toISOString(),
          revocation_reason: lostOrStolenRevocationReason,
        },
        at: revokedAt,
      },
      {
        entity: "register_snapshot_key",
        entityId: registerId,
        actorId,
        previousValue: { version: revocation.snapshotKeyVersion.previous },
        newValue: { version: revocation.snapshotKeyVersion.current },
        at: revokedAt,
      },
      {
        entity: "register_contingency_ticket_key",
        entityId: registerId,
        actorId,
        previousValue: { version: revocation.contingencyTicketKeyVersion.previous },
        newValue: { version: revocation.contingencyTicketKeyVersion.current },
        at: revokedAt,
      },
    ]);
  }
}

export class DrizzleLostRegisterRevocationStore<TQueryResult extends PgQueryResultHKT>
  implements LostRegisterRevocationStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly cipher: InstallationKeyCipher;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, cipher: InstallationKeyCipher, now: () => Date) {
    this.db = db;
    this.cipher = cipher;
    this.now = now;
  }

  transaction<TOutcome>(
    work: (tx: LostRegisterRevocationStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, undefined, (tx, pending) =>
      work(new DrizzleLostRegisterRevocationTransaction(tx, pending, this.cipher, this.now)),
    );
  }
}
