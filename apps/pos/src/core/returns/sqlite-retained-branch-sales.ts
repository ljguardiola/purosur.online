import type { KeptBranchSale, RetainedBranchSales } from "@purosur/domain/returns/use-cases";
import type { LocalDatabase } from "../platform/local-database";

interface RetainedRow {
  facts: string;
}

export function readRetainedBranchSale(
  database: LocalDatabase,
  saleId: string,
): KeptBranchSale | undefined {
  const row = database
    .prepare<[string], RetainedRow>("SELECT facts FROM branch_sales_for_return WHERE sale_id = ?")
    .get(saleId);
  if (row === undefined) {
    return undefined;
  }
  const facts: KeptBranchSale & { sale: { occurredAt: string } } = JSON.parse(row.facts);
  return { ...facts, sale: { ...facts.sale, occurredAt: new Date(facts.sale.occurredAt) } };
}

export class SqliteRetainedBranchSales implements RetainedBranchSales {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  keep(facts: KeptBranchSale): void {
    this.database
      .prepare(
        `INSERT INTO branch_sales_for_return (sale_id, facts) VALUES (@sale_id, @facts)
         ON CONFLICT (sale_id) DO UPDATE SET facts = excluded.facts`,
      )
      .run({ sale_id: facts.sale.sale.id, facts: JSON.stringify(facts) });
  }
}
