import { compareCodeUnits, compareSpanishText } from "@purosur/domain";
import type { FiscalAddress, FiscalAddressReader } from "@purosur/domain/fiscal/use-cases";
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

  async listFiscalAddresses(): Promise<FiscalAddress[]> {
    const rows = await this.db.select(storedFiscalAddress).from(fiscalAddresses);
    return rows.sort((a, b) => compareSpanishText(a.name, b.name) || compareCodeUnits(a.id, b.id));
  }
}
