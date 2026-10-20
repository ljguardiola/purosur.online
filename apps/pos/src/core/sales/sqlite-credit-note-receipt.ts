import { creditNoteCFiscalBlock, type FacturaC, receiptContent } from "@purosur/domain";
import { readCreditNoteOfSale } from "../fiscal/sqlite-void-credit-notes";
import type { LocalDatabase } from "../platform/local-database";
import type { CreditNoteReceiptContent } from "./receipt-printer/escpos-receipt-template";
import { readReceiptSource } from "./sqlite-receipt-ledger";

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
         WHERE sale_id = ? AND point_of_sale = ? AND number = ?`,
    )
    .get(saleId, pointOfSale, number, saleId, pointOfSale, number);
  if (row === undefined) {
    throw new Error("the invoice the credit note corrects is not of the sale");
  }
  return JSON.parse(row.document) as FacturaC;
}

function refundsOf(database: LocalDatabase, saleId: string): Refund[] {
  return database
    .prepare<[string], Refund>(
      `SELECT payment_refunds.method AS method, payment_refunds.amount AS amount
       FROM payment_refunds
       JOIN payment_transactions ON payment_transactions.id = payment_refunds.payment_id
       WHERE payment_transactions.sale_id = ?
       ORDER BY payment_refunds.rowid`,
    )
    .all(saleId);
}

export function readCreditNoteReceipt(
  database: LocalDatabase,
  saleId: string,
): CreditNoteReceiptContent | null {
  const creditNote = readCreditNoteOfSale(database, saleId);
  if (creditNote === null || creditNote.answer.kind !== "authorized") {
    return null;
  }
  const { answer, correctedVoucher } = creditNote;
  const { header, operation, lines, totals } = receiptContent(
    readReceiptSource(database, saleId, "VOIDED"),
  );
  return {
    header,
    operation: { ...operation, occurredAt: answer.issuedAt },
    issuedOn: answer.issuedOn,
    lines,
    totals: { subtotal: totals.subtotal, saleDiscount: totals.saleDiscount, total: totals.total },
    refunds: refundsOf(database, saleId),
    fiscal: creditNoteCFiscalBlock({
      pointOfSale: answer.pointOfSale,
      number: answer.number,
      issuedOn: answer.issuedOn,
      total: creditNote.total,
      document: correctedDocument(
        database,
        saleId,
        correctedVoucher.pointOfSale,
        correctedVoucher.number,
      ),
      authorizationCode: answer.authorizationCode,
      authorizationCodeDueOn: answer.authorizationCodeDueOn,
      corrects: correctedVoucher,
    }),
  };
}
