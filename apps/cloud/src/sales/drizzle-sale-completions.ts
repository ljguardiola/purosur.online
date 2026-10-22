import { SALE_STATES_AFTER_COMPLETION } from "@purosur/domain";
import type { SaleCompletions } from "@purosur/domain/fiscal/use-cases";
import { and, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { sales } from "../platform/db/schema.js";

export class DrizzleSaleCompletions<TQueryResult extends PgQueryResultHKT>
  implements SaleCompletions
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async holdsCompletionOf(registerId: string, saleId: string): Promise<boolean> {
    const [sale] = await this.db
      .select({ id: sales.id })
      .from(sales)
      .where(
        and(
          eq(sales.id, saleId),
          eq(sales.registerId, registerId),
          inArray(sales.state, [...SALE_STATES_AFTER_COMPLETION]),
        ),
      );
    return sale !== undefined;
  }
}
