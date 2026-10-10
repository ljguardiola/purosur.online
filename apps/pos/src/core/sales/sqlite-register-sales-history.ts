import {
  FACTURA_C_DOCUMENT_TYPE,
  type FiscalDocumentState,
  IN_PROGRESS_FISCAL_DOCUMENT_STATES,
  SALE_STANDING_DEFINITIONS,
  type SaleFiscalFacts,
  type SaleStanding,
  type SaleStandingDefinition,
  saleTotal,
} from "@purosur/domain";
import type {
  RegisterSalesHistory,
  SaleHistoryRecord,
  SalesHistoryEntry,
  SalesHistoryFilter,
  SalesHistoryPage,
} from "@purosur/domain/sales/use-cases";
import { readSalePayments } from "../payments/sqlite-sale-payments";
import type { LocalDatabase } from "../platform/local-database";

interface SaleRow {
  id: string;
  occurred_at: string;
  operation_number: number | null;
}

interface DetailRow extends SaleRow {
  first_name: string;
  line_count: number;
}

interface FiscalDocumentRow {
  state: FiscalDocumentState;
  point_of_sale: number;
  number: number;
}

const OF_THIS_REGISTER = `sales.state = 'COMPLETED'
  AND sales.register_id IN (SELECT id FROM own_register WHERE removed = 0)`;

const IN_THE_OPEN_SESSION =
  "sales.session_id IN (SELECT id FROM cash_sessions WHERE state = 'OPEN')";

const DEFERRED = "EXISTS (SELECT 1 FROM deferred_sales WHERE deferred_sales.sale_id = sales.id)";

const DOCUMENT_BEING_REQUESTED = `EXISTS (
  SELECT 1 FROM fiscal_documents
  WHERE fiscal_documents.sale_id = sales.id
    AND fiscal_documents.state IN (${IN_PROGRESS_FISCAL_DOCUMENT_STATES.map(() => "?").join(", ")})
)`;

interface Condition {
  sql: string;
  parameters: string[];
}

function factCondition(sql: string, parameters: string[], holds: boolean): Condition {
  return { sql: holds ? sql : `NOT ${sql}`, parameters };
}

function definitionCondition({
  deferred,
  documentBeingRequested,
}: SaleStandingDefinition): Condition {
  const facts = [factCondition(DEFERRED, [], deferred)];
  if (documentBeingRequested !== undefined) {
    facts.push(
      factCondition(
        DOCUMENT_BEING_REQUESTED,
        [...IN_PROGRESS_FISCAL_DOCUMENT_STATES],
        documentBeingRequested,
      ),
    );
  }
  return {
    sql: `(${facts.map(({ sql }) => sql).join(" AND ")})`,
    parameters: facts.flatMap(({ parameters }) => parameters),
  };
}

function standingCondition(standing: SaleStanding | undefined): Condition {
  switch (standing) {
    case undefined:
      return { sql: "1 = 1", parameters: [] };
    case "completed": {
      const others = Object.values(SALE_STANDING_DEFINITIONS).map(definitionCondition);
      return {
        sql: others.map(({ sql }) => `NOT ${sql}`).join(" AND "),
        parameters: others.flatMap(({ parameters }) => parameters),
      };
    }
    default:
      return definitionCondition(SALE_STANDING_DEFINITIONS[standing]);
  }
}

export class SqliteRegisterSalesHistory implements RegisterSalesHistory {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  salesOfOpenSession(filter: SalesHistoryFilter): SalesHistoryPage {
    return this.page(`${OF_THIS_REGISTER} AND ${IN_THE_OPEN_SESSION}`, filter);
  }

  salesOfRegister(filter: SalesHistoryFilter): SalesHistoryPage {
    return this.page(OF_THIS_REGISTER, filter);
  }

  saleOfRegister(saleId: string): SaleHistoryRecord | undefined {
    const sale = this.database
      .prepare<[string], DetailRow>(
        `SELECT sales.id AS id, sales.occurred_at AS occurred_at,
                sales.operation_number AS operation_number, users.first_name AS first_name,
                (SELECT count(*) FROM sale_lines WHERE sale_lines.sale_id = sales.id) AS line_count
         FROM sales JOIN users ON users.id = sales.actor_id
         WHERE sales.id = ? AND ${OF_THIS_REGISTER}`,
      )
      .get(saleId);
    if (sale === undefined) {
      return undefined;
    }
    return {
      saleId: sale.id,
      occurredAt: new Date(sale.occurred_at),
      operationNumber: sale.operation_number,
      servedByFirstName: sale.first_name,
      lineCount: sale.line_count,
      total: this.totalOf(sale.id),
      payments: readSalePayments(this.database, sale.id).map(({ method, amount }) => ({
        method,
        amount,
      })),
      fiscal: this.fiscalFactsOf(sale.id),
    };
  }

  private page(scope: string, { standing, offset, limit }: SalesHistoryFilter): SalesHistoryPage {
    const { sql, parameters } = standingCondition(standing);
    const where = `${scope} AND ${sql}`;
    const rows = this.database
      .prepare<(string | number)[], SaleRow>(
        `SELECT sales.id AS id, sales.occurred_at AS occurred_at,
                sales.operation_number AS operation_number
         FROM sales WHERE ${where}
         ORDER BY sales.occurred_at DESC, sales.rowid DESC LIMIT ? OFFSET ?`,
      )
      .all(...parameters, limit, offset);
    const counted = this.database
      .prepare<string[], { total: number }>(`SELECT count(*) AS total FROM sales WHERE ${where}`)
      .get(...parameters);
    return {
      entries: rows.map((row) => this.entryOf(row)),
      total: counted?.total ?? 0,
    };
  }

  private entryOf(row: SaleRow): SalesHistoryEntry {
    const methods = this.database
      .prepare<[string], { method: SalesHistoryEntry["paymentMethods"][number] }>(
        `SELECT method FROM payment_transactions WHERE sale_id = ?
         GROUP BY method ORDER BY min(rowid)`,
      )
      .all(row.id);
    return {
      saleId: row.id,
      occurredAt: new Date(row.occurred_at),
      operationNumber: row.operation_number,
      paymentMethods: methods.map(({ method }) => method),
      total: this.totalOf(row.id),
      fiscal: this.fiscalFactsOf(row.id),
    };
  }

  private totalOf(saleId: string): number {
    return saleTotal(
      this.database
        .prepare<[string], { lineTotal: number }>(
          "SELECT line_total AS lineTotal FROM sale_lines WHERE sale_id = ?",
        )
        .all(saleId),
    );
  }

  private fiscalFactsOf(saleId: string): SaleFiscalFacts {
    const document = this.database
      .prepare<[string], FiscalDocumentRow>(
        "SELECT state, point_of_sale, number FROM fiscal_documents WHERE sale_id = ?",
      )
      .get(saleId);
    const deferred =
      this.database.prepare("SELECT 1 FROM deferred_sales WHERE sale_id = ?").get(saleId) !==
      undefined;
    return {
      deferred,
      fiscalDocument:
        document === undefined
          ? null
          : {
              state: document.state,
              documentType: FACTURA_C_DOCUMENT_TYPE,
              pointOfSale: document.point_of_sale,
              number: document.number,
            },
    };
  }
}
