export { averageTicket } from "./model/average-ticket.js";
export type { CancelledSale } from "./model/cancelled-sale.js";
export type { CompletedSale } from "./model/completed-sale.js";
export { stockMovementsMatchLines } from "./model/completed-sale.js";
export type { CreditNoteReceiptContent } from "./model/credit-note-receipt-content.js";
export type { DeferredSaleFacts, DeferredSaleInvoice } from "./model/deferred-sale-lookup.js";
export type { SaleLinesGroup } from "./model/hand-typed-weights-report.js";
export type { ManualAdjustment, ManualAdjustmentValue } from "./model/manual-adjustment.js";
export {
  manualAdjustmentReason,
  mayBeManualDiscountAmount,
  mayBeManualDiscountPercent,
  mayBeOverriddenUnitPrice,
} from "./model/manual-adjustment.js";
export type {
  LineDiscountRecord,
  ManualDiscountRecords,
  SaleDiscountRecord,
} from "./model/manual-discounts-report.js";
export { openSaleStanding } from "./model/open-sale-standing.js";
export type { PrintedDocument, PrintedDocumentKey } from "./model/printed-document.js";
export { PRINTED_DOCUMENTS } from "./model/printed-document.js";
export type { ReceiptContent, ReceiptSource } from "./model/receipt-content.js";
export { receiptContent } from "./model/receipt-content.js";
export type { ReceiptCopy, ReceiptDelivery } from "./model/receipt-copy.js";
export type { SalePrintState, SaleReprint } from "./model/receipt-events.js";
export type {
  PrinterStatus,
  ReceiptPrintObservation,
  ReceiptPrintStanding,
} from "./model/receipt-print-standing.js";
export {
  mayStartReceiptPrint,
  observePrinterNotConfigured,
  observePrinterStatus,
  observePrintFailed,
  observePrintSent,
  receiptPrintStanding,
  startedReceiptPrint,
} from "./model/receipt-print-standing.js";
export {
  RECEIPT_REPRINT_REASON_MAX_LENGTH,
  receiptReprintReason,
} from "./model/receipt-reprint-reason.js";
export type {
  CancelledSaleFacts,
  RemovalFacts,
  RemovedLinesGroup,
} from "./model/removed-lines-and-cancelled-sales-report.js";
export { CANCELLED_SALES_REPORT_SALE_STATE } from "./model/removed-lines-and-cancelled-sales-report.js";
export type { RemovedSaleLine } from "./model/removed-sale-line.js";
export type { LinePromotion, Sale, SaleLine, SaleState, SaleWithLines } from "./model/sale.js";
export { SALE_STATES_AFTER_COMPLETION } from "./model/sale.js";
export type {
  SaleDiscount,
  SaleDiscountValue,
  SettledSaleLine,
} from "./model/sale-discount.js";
export {
  amountToCharge,
  appliedSaleDiscountAmount,
  saleDiscountUnavailability,
  settledLines,
} from "./model/sale-discount.js";
export type {
  DeferredSaleRecord,
  SaleComprobante,
  SaleFiscalDocument,
  SaleFiscalFacts,
  SaleStanding,
  SaleStandingDefinition,
} from "./model/sale-history.js";
export {
  isDeferralPending,
  PENDING_DEFERRED_SALE_RECORD,
  SALE_STANDING_DEFINITIONS,
  SALE_STANDINGS,
  SALES_HISTORY_PAGE_SIZE,
  saleComprobanteOf,
  saleFiscalDocumentAmong,
  saleStandingOf,
} from "./model/sale-history.js";
export type { ListPrice, SoldProduct } from "./model/sale-line.js";
export {
  grossSaleSubtotal,
  mayBeSaleLineQuantity,
  promotionSavings,
  saleTotal,
  saleUnitOfWeightSource,
} from "./model/sale-line.js";
export { UNPRINTED_SALE_STANDINGS } from "./model/sale-print-standing.js";
export { SALE_VOID_REFUSALS } from "./model/sale-void.js";
export type { SalesOfCashier, SoldByCashier } from "./model/sales-by-cashier.js";
export type {
  DiscountedLinesOfPromotion,
  PromotionDiscountTotals,
  PromotionTerms,
  SalesOfPromotion,
} from "./model/sales-by-promotion.js";
export type { SalesOfDay, SalesReportTotals } from "./model/sales-report.js";
export { SALES_REPORT_SALE_STATE } from "./model/sales-report.js";
export type { SalesReportGroup } from "./model/sales-report-group.js";
export { SALES_REPORT_GROUPS } from "./model/sales-report-group.js";
export type {
  SalesOfGroup,
  SoldLinesOfGroup,
  SoldTotals,
} from "./model/sold-lines-report.js";
export type { VoidedSale } from "./model/voided-sale.js";
export type { WeightSource } from "./model/weight-source.js";
export { WEIGHT_SOURCES } from "./model/weight-source.js";
