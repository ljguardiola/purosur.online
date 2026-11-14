import {
  type DeferredSaleReference,
  FACTURA_C_DOCUMENT_TYPE,
  type FiscalAuthorization,
  type FiscalDocumentState,
  isDeferralPending,
  type SaleDocumentNumber,
  type SaleFiscalDocument,
  type SaleFiscalFacts,
  type SaleUnit,
  saleFiscalDocumentAmong,
} from "@purosur/domain";
import type {
  RegisterSalesHistory,
  SaleHistoryLine,
  SaleHistoryRecord,
  SalesHistoryEntry,
  SalesHistoryFilter,
  SalesHistoryPage,
} from "@purosur/domain/sales/use-cases";
import { readUncancelledDeferredSaleRecord } from "../fiscal/sqlite-deferred-sales";
import { readCreditNotesOfSale } from "../fiscal/sqlite-sale-credit-notes";
import { readSaleInvoices } from "../fiscal/sqlite-sale-invoices";
import { readSalePayments } from "../payments/sqlite-sale-payments";
import type { LocalDatabase } from "../platform/local-database";
import { saleTotalOf } from "./sqlite-sale-total";

interface SaleRow {
  id: string;
  occurred_at: string;
  voided: 0 | 1;
}

interface DetailRow extends SaleRow {
  operation_number: number | null;
  first_name: string;
  in_open_session: 0 | 1;
  deferred_short_code: string | null;
  cash_rounding: number;
}

interface LineRow {
  product_name: string;
  sale_unit: SaleUnit;
  quantity: number;
  line_total: number;
}

interface FiscalDocumentRow {
  state: FiscalDocumentState;
  authorization: FiscalAuthorization;
  point_of_sale: number;
  number: number;
}

const OF_THIS_REGISTER = `sales.state IN ('COMPLETED', 'VOIDED')
  AND sales.register_id IN (SELECT id FROM own_register WHERE removed = 0)`;

const IN_THE_OPEN_SESSION =
  "sales.session_id IN (SELECT id FROM cash_sessions WHERE state = 'OPEN')";

const VOIDED = "(sales.state = 'VOIDED')";

const DEFERRED_SALE_SATISFIED = "(deferred_sales.satisfied_at IS NOT NULL)";

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

  salesOfOpenSessionWithDocument(document: SaleDocumentNumber): SalesHistoryEntry[] {
    return this.withDocument(`${OF_THIS_REGISTER} AND ${IN_THE_OPEN_SESSION}`, document);
  }

  salesOfRegisterWithDocument(document: SaleDocumentNumber): SalesHistoryEntry[] {
    return this.withDocument(OF_THIS_REGISTER, document);
  }

  salesOfOpenSessionOfDeferredSale(reference: DeferredSaleReference): SalesHistoryEntry[] {
    return this.ofDeferredSale(`${OF_THIS_REGISTER} AND ${IN_THE_OPEN_SESSION}`, reference);
  }

  salesOfRegisterOfDeferredSale(reference: DeferredSaleReference): SalesHistoryEntry[] {
    return this.ofDeferredSale(OF_THIS_REGISTER, reference);
  }

  saleOfRegister(saleId: string): SaleHistoryRecord | undefined {
    const sale = this.database
      .prepare<[string], DetailRow>(
        `SELECT sales.id AS id, sales.occurred_at AS occurred_at,
                sales.operation_number AS operation_number, users.first_name AS first_name,
                sales.cash_rounding AS cash_rounding,
                ${VOIDED} AS voided, (${IN_THE_OPEN_SESSION}) AS in_open_session,
                (SELECT short_code FROM deferred_sales WHERE deferred_sales.sale_id = sales.id)
                  AS deferred_short_code
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
      lines: this.linesOf(sale.id),
      cashRounding: sale.cash_rounding,
      total: this.totalOf(sale.id),
      payments: readSalePayments(this.database, sale.id).map((payment) => ({
        method: payment.method,
        amount: payment.amount,
        cardType: payment.method === "POINT" ? payment.cardType : null,
      })),
      fiscal: this.fiscalFactsOfSale(sale.id),
      voided: sale.voided === 1,
      inOpenSession: sale.in_open_session === 1,
      invoices: readSaleInvoices(this.database, sale.id),
      creditNotes: readCreditNotesOfSale(this.database, sale.id).map((note) => ({
        creditNoteId: note.creditNoteId,
        origin: note.origin.kind,
        standing: note.answer,
      })),
      deferredInvoiceIssued:
        readUncancelledDeferredSaleRecord(this.database, sale.id)?.satisfied === true,
      deferredShortCode: sale.deferred_short_code,
      hasReturn: this.hasReturn(sale.id),
    };
  }

  private ofDeferredSale(
    scope: string,
    { id, shortCode }: DeferredSaleReference,
  ): SalesHistoryEntry[] {
    const rows = this.database
      .prepare<{ id: string; short_code: string }, SaleRow>(
        `SELECT sales.id AS id, sales.occurred_at AS occurred_at, ${VOIDED} AS voided
         FROM sales WHERE ${scope} AND EXISTS (
           SELECT 1 FROM deferred_sales
           WHERE deferred_sales.sale_id = sales.id AND deferred_sales.id = @id
             AND deferred_sales.short_code = @short_code
         )
         ORDER BY sales.occurred_at DESC, sales.rowid DESC`,
      )
      .all({ id, short_code: shortCode });
    return rows.map((row) => this.entryOf(row));
  }

  private withDocument(
    scope: string,
    { pointOfSale, number }: SaleDocumentNumber,
  ): SalesHistoryEntry[] {
    const rows = this.database
      .prepare<{ number: number; point_of_sale: number | null }, SaleRow>(
        `SELECT sales.id AS id, sales.occurred_at AS occurred_at, ${VOIDED} AS voided
         FROM sales WHERE ${scope} AND (
           EXISTS (
             SELECT 1 FROM fiscal_documents
             WHERE fiscal_documents.sale_id = sales.id AND fiscal_documents.number = @number
               AND (@point_of_sale IS NULL OR fiscal_documents.point_of_sale = @point_of_sale)
           ) OR EXISTS (
             SELECT 1 FROM offline_fiscal_documents
             WHERE offline_fiscal_documents.sale_id = sales.id
               AND offline_fiscal_documents.document_type = 'factura_c'
               AND offline_fiscal_documents.number = @number
               AND (@point_of_sale IS NULL OR offline_fiscal_documents.point_of_sale = @point_of_sale)
           )
         )
         ORDER BY sales.occurred_at DESC, sales.rowid DESC`,
      )
      .all({ number, point_of_sale: pointOfSale });
    return rows.map((row) => this.entryOf(row));
  }

  private page(scope: string, { offset, limit }: SalesHistoryFilter): SalesHistoryPage {
    const rows = this.database
      .prepare<[number, number], SaleRow>(
        `SELECT sales.id AS id, sales.occurred_at AS occurred_at, ${VOIDED} AS voided
         FROM sales WHERE ${scope}
         ORDER BY sales.occurred_at DESC, sales.rowid DESC LIMIT ? OFFSET ?`,
      )
      .all(limit, offset);
    const counted = this.database
      .prepare<[], { total: number }>(`SELECT count(*) AS total FROM sales WHERE ${scope}`)
      .get();
    return {
      entries: rows.map((row) => this.entryOf(row)),
      total: counted?.total ?? 0,
    };
  }

  private entryOf(row: SaleRow): SalesHistoryEntry {
    const methods = this.database
      .prepare<[string], { method: SalesHistoryEntry["paymentMethods"][number] }>(
        `SELECT method FROM payment_transactions WHERE sale_id = ? AND state = 'APPROVED'
         GROUP BY method ORDER BY min(rowid)`,
      )
      .all(row.id);
    return {
      saleId: row.id,
      occurredAt: new Date(row.occurred_at),
      paymentMethods: methods.map(({ method }) => method),
      total: this.totalOf(row.id),
      fiscal: this.fiscalFactsOfSale(row.id),
      voided: row.voided === 1,
    };
  }

  private linesOf(saleId: string): SaleHistoryLine[] {
    return this.database
      .prepare<[string], LineRow>(
        `SELECT product_name, sale_unit, quantity, line_total FROM sale_lines
         WHERE sale_id = ? ORDER BY position`,
      )
      .all(saleId)
      .map(({ product_name, sale_unit, quantity, line_total }) => ({
        productName: product_name,
        saleUnit: sale_unit,
        quantity,
        lineTotal: line_total,
      }));
  }

  private hasReturn(saleId: string): boolean {
    return (
      this.database
        .prepare<[string], { id: string }>("SELECT id FROM returns WHERE sale_id = ? LIMIT 1")
        .get(saleId) !== undefined
    );
  }

  private totalOf(saleId: string): number {
    return saleTotalOf(this.database, saleId);
  }

  fiscalFactsOfSale(saleId: string): SaleFiscalFacts {
    const attempts = this.database
      .prepare<[{ sale_id: string }], FiscalDocumentRow>(
        `SELECT state, 'real_time' AS authorization, point_of_sale, number FROM fiscal_documents
         WHERE sale_id = @sale_id
         UNION ALL
         SELECT 'AUTHORIZED', 'offline_code', point_of_sale, number FROM offline_fiscal_documents
         WHERE sale_id = @sale_id AND document_type = 'factura_c'`,
      )
      .all({ sale_id: saleId })
      .map(
        (row): SaleFiscalDocument => ({
          state: row.state,
          documentType: FACTURA_C_DOCUMENT_TYPE,
          authorization: row.authorization,
          pointOfSale: row.point_of_sale,
          number: row.number,
        }),
      );
    const deferredRecord = this.database
      .prepare<[string], { satisfied: 0 | 1 }>(
        `SELECT ${DEFERRED_SALE_SATISFIED} AS satisfied FROM deferred_sales WHERE sale_id = ? AND cancelled_at IS NULL`,
      )
      .get(saleId);
    const record =
      deferredRecord === undefined ? null : { satisfied: deferredRecord.satisfied === 1 };
    return {
      deferred: isDeferralPending(record),
      fiscalDocument: saleFiscalDocumentAmong(attempts),
    };
  }
}
