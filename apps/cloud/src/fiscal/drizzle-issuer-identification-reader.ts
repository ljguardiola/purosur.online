import type {
  EditableIssuerIdentification,
  IssuerIdentificationReader,
} from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { ISSUER_IDENTIFICATION_SINGLETON_ID, issuerIdentification } from "../platform/db/schema.js";

export class DrizzleIssuerIdentificationReader<TQueryResult extends PgQueryResultHKT>
  implements IssuerIdentificationReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async currentIssuerIdentification(): Promise<EditableIssuerIdentification> {
    const [row] = await this.db
      .select({
        legalName: issuerIdentification.legalName,
        grossIncomeRegistration: issuerIdentification.grossIncomeRegistration,
        activityStartDate: issuerIdentification.activityStartDate,
        version: issuerIdentification.version,
      })
      .from(issuerIdentification)
      .where(eq(issuerIdentification.id, ISSUER_IDENTIFICATION_SINGLETON_ID));
    if (!row) {
      throw new Error("issuer identification row missing: the seeding migration never ran");
    }
    return row;
  }
}
