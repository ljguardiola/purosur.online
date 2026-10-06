import {
  type FiscalAddress,
  type FiscalAddressChange,
  FiscalAddressNameConflict,
  type FiscalAddressStore,
  type FiscalAddressStoreTransaction,
  type NewFiscalAddress,
} from "@purosur/domain/fiscal/use-cases";
import { asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";
import { auditLog, fiscalAddresses } from "../platform/db/schema.js";
import { storedFiscalAddress } from "./drizzle-fiscal-address-reader.js";

const UNIQUE_VIOLATION = "23505";
const FISCAL_ADDRESS_NAME_UNIQUE_INDEX = "fiscal_addresses_name_lower_key";

function auditValueOf({ name, streetAddress, version }: Omit<FiscalAddress, "id">) {
  return { name, street_address: streetAddress, version };
}

function isNameConflict(error: unknown): boolean {
  return postgresErrorChain(error).some(
    (link) =>
      link.code === UNIQUE_VIOLATION && link.constraint === FISCAL_ADDRESS_NAME_UNIQUE_INDEX,
  );
}

class DrizzleFiscalAddressStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements FiscalAddressStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(tx: PgDatabase<TQueryResult>, now: () => Date) {
    this.tx = tx;
    this.now = now;
  }

  listFiscalAddresses(): Promise<FiscalAddress[]> {
    return this.tx
      .select(storedFiscalAddress)
      .from(fiscalAddresses)
      .orderBy(asc(fiscalAddresses.name));
  }

  async lockFiscalAddress(fiscalAddressId: string): Promise<FiscalAddress | undefined> {
    const [current] = await this.tx
      .select(storedFiscalAddress)
      .from(fiscalAddresses)
      .where(eq(fiscalAddresses.id, fiscalAddressId))
      .for("update");
    return current;
  }

  async insertFiscalAddress(fiscalAddress: NewFiscalAddress): Promise<{ id: string }> {
    const { actorId, name, streetAddress } = fiscalAddress;
    let inserted: { id: string; version: number } | undefined;
    try {
      [inserted] = await this.tx
        .insert(fiscalAddresses)
        .values({ name, streetAddress })
        .returning({ id: fiscalAddresses.id, version: fiscalAddresses.version });
    } catch (error) {
      if (isNameConflict(error)) {
        throw new FiscalAddressNameConflict();
      }
      throw error;
    }
    if (!inserted) {
      throw new Error("inserting the fiscal address returned no row");
    }
    await this.tx.insert(auditLog).values({
      entity: "fiscal_address",
      entityId: inserted.id,
      actorId,
      previousValue: null,
      newValue: auditValueOf({ name, streetAddress, version: inserted.version }),
      at: this.now(),
    });
    return { id: inserted.id };
  }

  async updateFiscalAddress(change: FiscalAddressChange): Promise<void> {
    const { id, name, streetAddress, version, actorId } = change;
    const [previous] = await this.tx
      .select(storedFiscalAddress)
      .from(fiscalAddresses)
      .where(eq(fiscalAddresses.id, id));
    try {
      await this.tx
        .update(fiscalAddresses)
        .set({ name, streetAddress, version })
        .where(eq(fiscalAddresses.id, id));
    } catch (error) {
      if (isNameConflict(error)) {
        throw new FiscalAddressNameConflict();
      }
      throw error;
    }
    await this.tx.insert(auditLog).values({
      entity: "fiscal_address",
      entityId: id,
      actorId,
      previousValue: previous ? auditValueOf(previous) : null,
      newValue: auditValueOf(change),
      at: this.now(),
    });
  }
}

export class DrizzleFiscalAddressStore<TQueryResult extends PgQueryResultHKT>
  implements FiscalAddressStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  transaction<TOutcome>(
    work: (tx: FiscalAddressStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) =>
      work(new DrizzleFiscalAddressStoreTransaction(tx, this.now)),
    );
  }
}
