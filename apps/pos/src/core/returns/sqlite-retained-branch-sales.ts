import type { KeptBranchSale, RetainedBranchSales } from "@purosur/domain/returns/use-cases";
import type { LocalDatabase } from "../platform/local-database";

interface RetainedRow {
  facts: string;
}

type KeptSale = KeptBranchSale["sale"];
type KeptLine = KeptSale["sale"]["lines"][number];

type StoredLine = Omit<KeptLine, "promotionKind"> & { promotionKind?: KeptLine["promotionKind"] };

type StoredFacts = Omit<KeptBranchSale, "sale"> & {
  sale: Omit<KeptSale, "sale" | "occurredAt"> & {
    occurredAt: string;
    sale: Omit<KeptSale["sale"], "lines"> & { lines: StoredLine[] };
  };
};

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
  const facts: StoredFacts = JSON.parse(row.facts);
  return {
    ...facts,
    sale: {
      ...facts.sale,
      sale: {
        ...facts.sale.sale,
        lines: facts.sale.sale.lines.map((line) => ({
          ...line,
          promotionKind: line.promotionKind ?? null,
        })),
      },
      occurredAt: new Date(facts.sale.occurredAt),
    },
  };
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
