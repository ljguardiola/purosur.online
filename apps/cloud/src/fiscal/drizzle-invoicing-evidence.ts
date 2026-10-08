import type { InvoicingEvidence } from "@purosur/domain/fiscal/use-cases";
import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { arcaInvoicingEvidence } from "../platform/db/schema.js";

export class DrizzleInvoicingEvidence<TQueryResult extends PgQueryResultHKT>
  implements InvoicingEvidence
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async recordInvoicingCallOk(at: Date): Promise<void> {
    await this.db
      .insert(arcaInvoicingEvidence)
      .values({ lastCallOkAt: at })
      .onConflictDoUpdate({
        target: arcaInvoicingEvidence.id,
        set: {
          lastCallOkAt: sql`greatest(${arcaInvoicingEvidence.lastCallOkAt}, excluded.last_call_ok_at)`,
        },
      });
  }
}
