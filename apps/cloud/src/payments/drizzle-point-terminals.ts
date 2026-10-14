import type { PointTerminals } from "@purosur/domain/payments/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registerPointTerminals } from "../platform/db/schema.js";

export class DrizzlePointTerminals<TQueryResult extends PgQueryResultHKT>
  implements PointTerminals
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async terminalOfRegister(registerId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ terminalId: registerPointTerminals.terminalId })
      .from(registerPointTerminals)
      .where(eq(registerPointTerminals.registerId, registerId));
    return row?.terminalId ?? null;
  }
}
