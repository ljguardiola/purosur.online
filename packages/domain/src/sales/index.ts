export type { CancelledSale } from "./model/cancelled-sale.js";
export type { CompletedSale } from "./model/completed-sale.js";
export { stockMovementsMatchLines } from "./model/completed-sale.js";
export { openSaleStanding } from "./model/open-sale-standing.js";
export type {
  ReceiptContent,
  ReceiptContentLine,
  ReceiptHeader,
  ReceiptSource,
  ReceiptSourceLine,
  ReceiptSourcePayment,
} from "./model/receipt-content.js";
export { receiptContent } from "./model/receipt-content.js";
export type { ReceiptCopy, ReceiptDelivery } from "./model/receipt-copy.js";
export { nextReceiptCopy } from "./model/receipt-copy.js";
export type {
  PrinterStatus,
  ReceiptPrintObservation,
  ReceiptPrintStanding,
} from "./model/receipt-print-standing.js";
export {
  mayStartReceiptPrint,
  observePrintAcknowledged,
  observePrinterStatus,
  RECEIPT_RETRY_DELAY_MS,
  receiptPrintStanding,
  startedReceiptPrint,
} from "./model/receipt-print-standing.js";
export type { LinePromotion, Sale, SaleLine, SaleState, SaleWithLines } from "./model/sale.js";
export type { ListPrice, SoldProduct } from "./model/sale-line.js";
export { mayBeSaleLineQuantity, saleTotal } from "./model/sale-line.js";
export type { SalesOfDay, SalesReportRange, SalesReportTotals } from "./model/sales-report.js";
export { isSalesReportRangeAsked, SALES_REPORT_SALE_STATE } from "./model/sales-report.js";
