import type { QrPointsOfSale } from "@purosur/domain/payments/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registerQrPointsOfSale } from "../platform/db/schema.js";

export class DrizzleQrPointsOfSale<TQueryResult extends PgQueryResultHKT>
  implements QrPointsOfSale
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async pointOfSaleOfRegister(registerId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ externalPosId: registerQrPointsOfSale.externalPosId })
      .from(registerQrPointsOfSale)
      .where(eq(registerQrPointsOfSale.registerId, registerId));
    return row?.externalPosId ?? null;
  }
}
