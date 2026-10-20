import type {
  BitlockerRecoveryKeyConsultation,
  BitlockerRecoveryKeyLoad,
  BitlockerRecoveryKeyStore,
  BitlockerRecoveryKeyStoreTransaction,
  HeldBitlockerRecoveryKey,
  NewBitlockerRecoveryKey,
} from "@purosur/domain/register/use-cases";
import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  auditLog,
  registerInstallationBitlockerKeys,
  registerInstallations,
  registers,
} from "../platform/db/schema.js";
import type { InstallationKeyCipher } from "./installation-key-cipher.js";

const AUDIT_ENTITY = "register_installation_bitlocker_key";

const recoveryKeyPurpose = (installationId: string) => `bitlocker-recovery-key:${installationId}`;

class DrizzleBitlockerRecoveryKeyTransaction<TQueryResult extends PgQueryResultHKT>
  implements BitlockerRecoveryKeyStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly cipher: InstallationKeyCipher;

  constructor(tx: PgDatabase<TQueryResult>, cipher: InstallationKeyCipher) {
    this.tx = tx;
    this.cipher = cipher;
  }

  async lockBranchRegister(branchId: string, registerId: string): Promise<boolean> {
    const [register] = await this.tx
      .select({ id: registers.id })
      .from(registers)
      .where(and(eq(registers.id, registerId), eq(registers.locationId, branchId)))
      .for("no key update");
    return register !== undefined;
  }

  async currentInstallationOf(registerId: string): Promise<string | null> {
    const [installation] = await this.tx
      .select({ id: registerInstallations.id })
      .from(registerInstallations)
      .where(
        and(
          eq(registerInstallations.registerId, registerId),
          isNull(registerInstallations.revokedAt),
        ),
      );
    return installation?.id ?? null;
  }

  async hasRecoveryKey(installationId: string): Promise<boolean> {
    const [held] = await this.tx
      .select({ installationId: registerInstallationBitlockerKeys.installationId })
      .from(registerInstallationBitlockerKeys)
      .where(eq(registerInstallationBitlockerKeys.installationId, installationId));
    return held !== undefined;
  }

  async storeRecoveryKey(key: NewBitlockerRecoveryKey): Promise<void> {
    await this.tx.insert(registerInstallationBitlockerKeys).values({
      installationId: key.installationId,
      sealedKey: this.cipher.seal(key.recoveryKey, recoveryKeyPurpose(key.installationId)),
      keyIdentifier: key.keyIdentifier,
      loadedAt: key.loadedAt,
      loadedBy: key.loadedBy,
    });
  }

  async recoveryKeyOf(installationId: string): Promise<HeldBitlockerRecoveryKey | null> {
    const [held] = await this.tx
      .select({
        sealedKey: registerInstallationBitlockerKeys.sealedKey,
        keyIdentifier: registerInstallationBitlockerKeys.keyIdentifier,
      })
      .from(registerInstallationBitlockerKeys)
      .where(eq(registerInstallationBitlockerKeys.installationId, installationId));
    if (held === undefined) {
      return null;
    }
    return {
      recoveryKey: this.cipher.open(held.sealedKey, recoveryKeyPurpose(installationId)),
      keyIdentifier: held.keyIdentifier,
    };
  }

  recordRecoveryKeyLoaded(load: BitlockerRecoveryKeyLoad): Promise<void> {
    return this.recordAudit(load, "loaded");
  }

  recordRecoveryKeyConsulted(consultation: BitlockerRecoveryKeyConsultation): Promise<void> {
    return this.recordAudit(consultation, "consulted");
  }

  private async recordAudit(
    { registerId, installationId, actorId, at }: BitlockerRecoveryKeyLoad,
    action: "loaded" | "consulted",
  ): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: AUDIT_ENTITY,
      entityId: installationId,
      actorId,
      previousValue: null,
      newValue: { register_id: registerId, action },
      at,
    });
  }
}

export class DrizzleBitlockerRecoveryKeyStore<TQueryResult extends PgQueryResultHKT>
  implements BitlockerRecoveryKeyStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly cipher: InstallationKeyCipher;

  constructor(db: PgDatabase<TQueryResult>, cipher: InstallationKeyCipher) {
    this.db = db;
    this.cipher = cipher;
  }

  transaction<TOutcome>(
    work: (tx: BitlockerRecoveryKeyStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) =>
      work(new DrizzleBitlockerRecoveryKeyTransaction(tx as PgDatabase<TQueryResult>, this.cipher)),
    );
  }
}
