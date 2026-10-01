import type { FiscalAddress, FiscalAddressReader } from "@purosur/domain/fiscal/use-cases";
import { asc } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { fiscalAddresses } from "../platform/db/schema.js";

export const storedFiscalAddress = {
  id: fiscalAddresses.id,
  name: fiscalAddresses.name,
  streetAddress: fiscalAddresses.streetAddress,
  version: fiscalAddresses.version,
};

export class DrizzleFiscalAddressReader<TQueryResult extends PgQueryResultHKT>
  implements FiscalAddressReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  listFiscalAddresses(): Promise<FiscalAddress[]> {
    return this.db
      .select(storedFiscalAddress)
      .from(fiscalAddresses)
      .orderBy(asc(fiscalAddresses.name));
  }
}
