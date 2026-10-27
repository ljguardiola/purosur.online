import {
  type CreditNoteReceiptContent,
  creditNoteCFiscalBlock,
  type FacturaC,
  offlineCreditNoteCFiscalBlock,
  receiptContent,
  returnedReceiptLine,
} from "@purosur/domain";
import { readCreditNoteById, type StoredCreditNote } from "../fiscal/sqlite-sale-credit-notes";
import type { LocalDatabase } from "../platform/local-database";
import { readReceiptSource } from "./sqlite-receipt-source";

type Refund = CreditNoteReceiptContent["refunds"][number];

function correctedDocument(
  database: LocalDatabase,
  saleId: string,
  pointOfSale: number,
  number: number,
): FacturaC {
  const row = database
    .prepare<[string, number, number, string, number, number], { document: string }>(
      `SELECT document FROM fiscal_documents
         WHERE sale_id = ? AND point_of_sale = ? AND number = ?
       UNION ALL
       SELECT document FROM offline_fiscal_documents
         WHERE sale_id = ? AND point_of_sale = ? AND number = ? AND document_type = 'factura_c'`,
    )
    .get(saleId, pointOfSale, number, saleId, pointOfSale, number);
  if (row === undefined) {
    throw new Error("the invoice the credit note corrects is not of the sale");
  }
  return JSON.parse(row.document) as FacturaC;
}

function refundsOf(database: LocalDatabase, saleId: string, returnId: string | null): Refund[] {
  return database
    .prepare<[string, string | null], Refund>(
      `SELECT payment_refunds.method AS method, payment_refunds.amount AS amount
       FROM payment_refunds
       JOIN payment_transactions ON payment_transactions.id = payment_refunds.payment_id
       WHERE payment_transactions.sale_id = ?
         AND payment_refunds.return_id IS ?
       ORDER BY payment_refunds.rowid`,
    )
    .all(saleId, returnId);
}

interface ReturnedLineRow {
  sale_line_index: number;
  quantity: number;
  refunded_amount: number;
}

interface ReturnedHeaderRow {
  address: string;
  whatsapp_number: string;
  instagram_handle: string;
  first_name: string;
  operation_number: number | null;
}

function returnedContent(
  database: LocalDatabase,
  saleId: string,
  returnId: string,
  creditNoteTotal: number,
): Pick<CreditNoteReceiptContent, "header" | "operation" | "lines" | "totals"> {
  const header = database
    .prepare<[string, string], ReturnedHeaderRow>(
      `SELECT branch_settings.address AS address, branch_settings.whatsapp_number AS whatsapp_number,
              branch_settings.instagram_handle AS instagram_handle, users.first_name AS first_name,
              sales.operation_number AS operation_number
       FROM branch_settings, sales
       JOIN returns ON returns.sale_id = sales.id AND returns.id = ?
       JOIN users ON users.id = returns.actor_id
       WHERE sales.id = ?
       ORDER BY branch_settings.location_id LIMIT 1`,
    )
    .get(returnId, saleId);
  if (header === undefined || header.operation_number === null) {
    throw new Error("the return's credit note cannot be sourced");
  }
  const sold = receiptContent(readReceiptSource(database, saleId, "COMPLETED")).lines;
  const lines = database
    .prepare<[string], ReturnedLineRow>(
      `SELECT (SELECT COUNT(*) FROM sale_lines AS earlier
                WHERE earlier.sale_id = sale_lines.sale_id
                  AND earlier.position < sale_lines.position) AS sale_line_index,
              return_lines.quantity AS quantity, return_lines.refunded_amount AS refunded_amount
       FROM return_lines
       JOIN sale_lines ON sale_lines.id = return_lines.sale_line_id
       WHERE return_lines.return_id = ?
       ORDER BY sale_lines.position`,
    )
    .all(returnId)
    .map((line) => {
      const soldLine = sold[line.sale_line_index];
      if (soldLine === undefined) {
        throw new Error("the return's credit note cannot be sourced");
      }
      return returnedReceiptLine(soldLine, {
        quantity: line.quantity,
        refundedAmount: line.refunded_amount,
      });
    });
  return {
    header: {
      address: header.address,
      whatsappNumber: header.whatsapp_number,
      instagramHandle: header.instagram_handle,
    },
    operation: {
      occurredAt: new Date(0),
      servedByFirstName: header.first_name,
      operationNumber: header.operation_number,
    },
    lines,
    totals: { subtotal: creditNoteTotal, saleDiscount: null, total: creditNoteTotal },
  };
}

function receiptBody(
  database: LocalDatabase,
  { saleId, total, origin }: StoredCreditNote,
): Pick<CreditNoteReceiptContent, "header" | "operation" | "lines" | "totals"> {
  if (origin.kind === "sale_return") {
    return returnedContent(database, saleId, origin.returnId, total);
  }
  const { header, operation, lines, totals } = receiptContent(
    readReceiptSource(database, saleId, "VOIDED"),
  );
  return {
    header,
    operation,
    lines,
    totals: { subtotal: totals.subtotal, saleDiscount: totals.saleDiscount, total: totals.total },
  };
}

export function readCreditNoteReceipt(
  database: LocalDatabase,
  creditNoteId: string,
): CreditNoteReceiptContent | null {
  const creditNote = readCreditNoteById(database, creditNoteId);
  if (
    creditNote === null ||
    creditNote.correctedVoucher === null ||
    (creditNote.answer.kind !== "authorized" && creditNote.answer.kind !== "issued_offline")
  ) {
    return null;
  }
  const { answer, correctedVoucher, saleId, origin } = creditNote;
  const { header, operation, lines, totals } = receiptBody(database, creditNote);
  const document = correctedDocument(
    database,
    saleId,
    correctedVoucher.pointOfSale,
    correctedVoucher.number,
  );
  return {
    header,
    operation: { ...operation, occurredAt: answer.issuedAt },
    issuedOn: answer.issuedOn,
    lines,
    totals,
    refunds: refundsOf(database, saleId, origin.kind === "sale_return" ? origin.returnId : null),
    fiscal:
      answer.kind === "authorized"
        ? creditNoteCFiscalBlock({
            pointOfSale: answer.pointOfSale,
            number: answer.number,
            issuedOn: answer.issuedOn,
            total: creditNote.total,
            document,
            authorizationCode: answer.authorizationCode,
            authorizationCodeDueOn: answer.authorizationCodeDueOn,
            corrects: correctedVoucher,
          })
        : offlineCreditNoteCFiscalBlock({
            pointOfSale: answer.pointOfSale,
            number: answer.number,
            issuedOn: answer.issuedOn,
            total: creditNote.total,
            document,
            offlineAuthorizationCode: answer.offlineAuthorizationCode,
            fortnight: answer.fortnight,
            corrects: correctedVoucher,
          }),
  };
}
