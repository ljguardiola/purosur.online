import type {
  LostRegisterRevocation,
  LostRegisterRevocationStore,
  LostRegisterRevocationStoreTransaction,
} from "@purosur/domain/register/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { requirePinResetOfUsers } from "../credentials/require-pin-reset-of-users.js";
import { registerEnrollmentCodes, registers } from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";
import {
  DrizzleInstallationRevocation,
  type RevocationTransaction,
} from "./drizzle-installation-revocation.js";
import type { InstallationKeyCipher } from "./installation-key-cipher.js";

class DrizzleLostRegisterRevocationTransaction<TQueryResult extends PgQueryResultHKT>
  extends DrizzleInstallationRevocation<TQueryResult>
  implements LostRegisterRevocationStoreTransaction
{
  private readonly pending: PendingChanges;

  constructor(
    tx: RevocationTransaction<TQueryResult>,
    pending: PendingChanges,
    cipher: InstallationKeyCipher,
    now: () => Date,
  ) {
    super(tx, cipher, now, "lost_or_stolen");
    this.pending = pending;
  }

  // An enrollment only key-shares the register row, so NO KEY UPDATE never waits for it; its
  // enrollment code row, which the enrollment locks first, is what serializes the two.
  async lockBranchRegister(branchId: string, registerId: string): Promise<boolean> {
    const [register] = await this.tx
      .select({ id: registers.id })
      .from(registers)
      .where(and(eq(registers.id, registerId), eq(registers.locationId, branchId)))
      .for("no key update");
    if (register === undefined) {
      return false;
    }
    await this.tx
      .select({ registerId: registerEnrollmentCodes.registerId })
      .from(registerEnrollmentCodes)
      .where(eq(registerEnrollmentCodes.registerId, registerId))
      .for("update");
    return true;
  }

  async requirePinResetOfBranchUsers(branchId: string, actorId: string): Promise<void> {
    await requirePinResetOfUsers(this.tx, this.pending, {
      branchId,
      actorId,
      requiredBy: "register_revocation",
      at: this.now(),
    });
  }

  recordLostRegisterRevocation(revocation: LostRegisterRevocation): Promise<void> {
    return this.recordRevocationAudit(revocation);
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
