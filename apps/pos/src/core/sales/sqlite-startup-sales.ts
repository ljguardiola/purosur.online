import type { StartupSale, StartupSales } from "@purosur/domain/sales/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { saleTotalOf } from "./sqlite-sale-total";

interface StartupSaleRow {
  id: string;
  occurred_at: string;
  print_attempted_at: string | null;
  printed_at: string | null;
}

function optionalDate(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

export class SqliteStartupSales implements StartupSales {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  completedSalesOfOpenSession(): StartupSale[] {
    return this.database
      .prepare<[], StartupSaleRow>(
        `SELECT id, occurred_at, print_attempted_at, printed_at FROM sales
         WHERE state = 'COMPLETED'
           AND session_id IN (SELECT id FROM cash_sessions WHERE state = 'OPEN')
         ORDER BY occurred_at, rowid`,
      )
      .all()
      .map((row) => ({
        saleId: row.id,
        completedAt: new Date(row.occurred_at),
        total: saleTotalOf(this.database, row.id),
        printAttemptedAt: optionalDate(row.print_attempted_at),
        printedAt: optionalDate(row.printed_at),
      }));
  }
}
