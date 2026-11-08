import type {
  SettlementReportRequest,
  SettlementReportRow,
  SettlementReportStore,
} from "@purosur/domain/payments/use-cases";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  mercadoPagoSettlementMovements,
  mercadoPagoSettlementReportRequests,
} from "../platform/db/schema.js";

export class DrizzleSettlementReportStore<TQueryResult extends PgQueryResultHKT>
  implements SettlementReportStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async requestOfDay(day: string): Promise<SettlementReportRequest | null> {
    const [row] = await this.db
      .select()
      .from(mercadoPagoSettlementReportRequests)
      .where(eq(mercadoPagoSettlementReportRequests.day, day));
    return row ?? null;
  }

  async recordRequest(
    request: Omit<SettlementReportRequest, "refused" | "recordedAt">,
  ): Promise<void> {
    const unanswered = { ...request, refused: false };
    await this.db
      .insert(mercadoPagoSettlementReportRequests)
      .values(unanswered)
      .onConflictDoUpdate({
        target: mercadoPagoSettlementReportRequests.day,
        set: { ...unanswered, recordedAt: null },
      });
  }

  async recordRefusal(day: string): Promise<void> {
    await this.db
      .update(mercadoPagoSettlementReportRequests)
      .set({ refused: true })
      .where(eq(mercadoPagoSettlementReportRequests.day, day));
  }

  async recordRows(day: string, rows: SettlementReportRow[], recordedAt: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      const marked = await tx
        .update(mercadoPagoSettlementReportRequests)
        .set({ recordedAt })
        .where(eq(mercadoPagoSettlementReportRequests.day, day))
        .returning({ day: mercadoPagoSettlementReportRequests.day });
      if (marked.length === 0) {
        throw new Error(`No settlement report was requested for ${day}`);
      }
      for (const row of rows) {
        const stored = { ...row, recordedAt };
        await tx
          .insert(mercadoPagoSettlementMovements)
          .values(stored)
          .onConflictDoUpdate({
            target: [
              mercadoPagoSettlementMovements.sourceId,
              mercadoPagoSettlementMovements.transactionType,
              mercadoPagoSettlementMovements.transactionDate,
            ],
            set: {
              externalReference: sql`excluded.external_reference`,
              paymentMethod: sql`excluded.payment_method`,
              paymentMethodType: sql`excluded.payment_method_type`,
              grossAmount: sql`excluded.gross_amount`,
              feeAmount: sql`excluded.fee_amount`,
              financingFeeAmount: sql`excluded.financing_fee_amount`,
              taxesAmount: sql`excluded.taxes_amount`,
              netAmount: sql`excluded.net_amount`,
              moneyReleaseDate: sql`excluded.money_release_date`,
              recordedAt: sql`excluded.recorded_at`,
            },
          });
      }
    });
  }
}
