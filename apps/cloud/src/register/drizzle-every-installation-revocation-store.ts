import type {
  EveryInstallationRevocationRecord,
  EveryInstallationRevocationStore,
  EveryInstallationRevocationStoreTransaction,
} from "@purosur/domain/register/use-cases";
import { asc } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registerEnrollmentCodes, registers } from "../platform/db/schema.js";
import {
  DrizzleInstallationRevocation,
  type RevocationTransaction,
} from "./drizzle-installation-revocation.js";
import type { InstallationKeyCipher } from "./installation-key-cipher.js";

class DrizzleEveryInstallationRevocationTransaction<TQueryResult extends PgQueryResultHKT>
  extends DrizzleInstallationRevocation<TQueryResult>
  implements EveryInstallationRevocationStoreTransaction
{
  constructor(
    tx: RevocationTransaction<TQueryResult>,
    cipher: InstallationKeyCipher,
    now: () => Date,
  ) {
    super(tx, cipher, now, "suspected_compromise");
  }

  // Registers come first and enrollment codes second, both in id order, because an enrollment
  // locks the codes it redeems in register order and then reaches its register only through a
  // foreign key check, which NO KEY UPDATE leaves free. Holding every code until the end makes an
  // enrollment either finish before the revocation reads the register's installation or start
  // after it.
  async lockEveryRegister(): Promise<string[]> {
    const rows = await this.tx
      .select({ id: registers.id })
      .from(registers)
      .orderBy(asc(registers.id))
      .for("no key update");
    await this.tx
      .select({ registerId: registerEnrollmentCodes.registerId })
      .from(registerEnrollmentCodes)
      .orderBy(asc(registerEnrollmentCodes.registerId))
      .for("update");
    return rows.map((row) => row.id);
  }

  recordEveryInstallationRevocation(revocation: EveryInstallationRevocationRecord): Promise<void> {
    return this.recordRevocationAudit(revocation);
  }
}

export class DrizzleEveryInstallationRevocationStore<TQueryResult extends PgQueryResultHKT>
  implements EveryInstallationRevocationStore
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
    work: (tx: EveryInstallationRevocationStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) =>
      work(new DrizzleEveryInstallationRevocationTransaction(tx, this.cipher, this.now)),
    );
  }
}
