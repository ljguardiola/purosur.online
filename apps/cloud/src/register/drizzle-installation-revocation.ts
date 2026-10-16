import type {
  HeldRegisterKeys,
  InstallationRevocationAlert,
  InstallationRevocationTransaction,
  KeyVersionChange,
  RevokedInstallation,
  VersionedKey,
} from "@purosur/domain/register/use-cases";
import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../alerts/open-alert.js";
import {
  auditLog,
  registerContingencyTicketKeys,
  registerInstallations,
  registerSnapshotKeys,
} from "../platform/db/schema.js";
import {
  contingencyTicketKeyPurpose,
  lockRegisterKeysOf,
  snapshotKeyPurpose,
} from "./drizzle-register-store.js";
import type { InstallationKeyCipher } from "./installation-key-cipher.js";

export type RevocationTransaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

export type InstallationRevocationReason = Extract<
  NonNullable<(typeof registerInstallations.$inferInsert)["revocationReason"]>,
  "lost_or_stolen" | "suspected_compromise"
>;

export interface InstallationRevocationAudit {
  registerId: string;
  deviceId: string;
  revokedAt: Date;
  actorId: string;
  snapshotKeyVersion: KeyVersionChange;
  contingencyTicketKeyVersion: KeyVersionChange;
}

export class DrizzleInstallationRevocation<TQueryResult extends PgQueryResultHKT>
  implements InstallationRevocationTransaction
{
  protected readonly tx: RevocationTransaction<TQueryResult>;
  protected readonly now: () => Date;
  private readonly cipher: InstallationKeyCipher;
  private readonly reason: InstallationRevocationReason;

  constructor(
    tx: RevocationTransaction<TQueryResult>,
    cipher: InstallationKeyCipher,
    now: () => Date,
    reason: InstallationRevocationReason,
  ) {
    this.tx = tx;
    this.cipher = cipher;
    this.now = now;
    this.reason = reason;
  }

  async revokeActiveInstallation(
    registerId: string,
    revokedAt: Date,
  ): Promise<RevokedInstallation | null> {
    const [revoked] = await this.tx
      .update(registerInstallations)
      .set({ revokedAt, revocationReason: this.reason })
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

  async lockRegisterKeys(registerId: string): Promise<HeldRegisterKeys> {
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

  async openRevocationAlert(alert: InstallationRevocationAlert): Promise<void> {
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

  protected async recordRevocationAudit(revocation: InstallationRevocationAudit): Promise<void> {
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
          revocation_reason: this.reason,
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
