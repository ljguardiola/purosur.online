import type { SaleVoidCreditNote } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";

export function insertPendingCreditNote(
  database: LocalDatabase,
  { creditNoteId, saleId, total, receiverTaxStatusCode, correctedVoucher }: SaleVoidCreditNote,
): void {
  database
    .prepare(
      `INSERT INTO sale_void_credit_notes (
         id, sale_id, total, receiver_tax_status_code, corrected_voucher_type,
         corrected_point_of_sale, corrected_number, state, recorded_at
       )
       SELECT @id, id, @total, @receiver_tax_status_code, @voucher_type, @point_of_sale, @number,
              'IN_PROGRESS', voided_at
       FROM sales WHERE id = @sale_id AND state = 'VOIDED'`,
    )
    .run({
      id: creditNoteId,
      sale_id: saleId,
      total,
      receiver_tax_status_code: receiverTaxStatusCode,
      voucher_type: correctedVoucher.voucherType,
      point_of_sale: correctedVoucher.pointOfSale,
      number: correctedVoucher.number,
    });
}
