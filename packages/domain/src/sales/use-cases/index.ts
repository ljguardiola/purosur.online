export type {
  Clock,
  OperationAuthority,
  OperationAuthorization,
  Scale,
  ScaleReading,
} from "../../shared/index.js";
export type {
  AddScannedProductInput,
  AddScannedProductOutcome,
  AddScannedProductPorts,
} from "./add-scanned-product.js";
export { addScannedProduct } from "./add-scanned-product.js";
export type {
  AddSearchedProductInput,
  AddSearchedProductOutcome,
  AddSearchedProductPorts,
} from "./add-searched-product.js";
export { addSearchedProduct } from "./add-searched-product.js";
export type {
  AddWeighedProductInput,
  AddWeighedProductOutcome,
  AddWeighedProductPorts,
} from "./add-weighed-product.js";
export { addWeighedProduct } from "./add-weighed-product.js";
export type {
  AdjustSaleLineGrant,
  AdjustSaleLineInput,
  AdjustSaleLineOutcome,
  AdjustSaleLinePorts,
} from "./adjust-sale-line.js";
export { adjustSaleLine } from "./adjust-sale-line.js";
export type {
  ApplySaleDiscountGrant,
  ApplySaleDiscountInput,
  ApplySaleDiscountOutcome,
  ApplySaleDiscountPorts,
} from "./apply-sale-discount.js";
export { applySaleDiscount } from "./apply-sale-discount.js";
export type {
  CancelPaidSaleGrant,
  CancelPaidSaleInput,
  CancelPaidSaleOutcome,
  CancelPaidSalePorts,
} from "./cancel-paid-sale.js";
export { cancelPaidSale } from "./cancel-paid-sale.js";
export type {
  CancelSaleInput,
  CancelSaleOutcome,
  CancelSalePorts,
} from "./cancel-sale.js";
export { cancelSale } from "./cancel-sale.js";
export type {
  CashierSalesQuery,
  CashierSalesReportReader,
} from "./cashier-sales-report-reader.js";
export type {
  ChangeLineQuantityInput,
  ChangeLineQuantityOutcome,
  ChangeLineQuantityPorts,
} from "./change-line-quantity.js";
export { changeLineQuantity } from "./change-line-quantity.js";
export type {
  ChangeLineWeightInput,
  ChangeLineWeightOutcome,
  ChangeLineWeightPorts,
} from "./change-line-weight.js";
export { changeLineWeight } from "./change-line-weight.js";
export type {
  ChargeSaleByTransferInput,
  ChargeSaleByTransferOutcome,
  ChargeSaleByTransferPorts,
} from "./charge-sale-by-transfer.js";
export { chargeSaleByTransfer } from "./charge-sale-by-transfer.js";
export type {
  ChargeSaleInCashInput,
  ChargeSaleInCashOutcome,
  ChargeSaleInCashPorts,
} from "./charge-sale-in-cash.js";
export { chargeSaleInCash } from "./charge-sale-in-cash.js";
export type {
  ChargeSaleOnStandaloneTerminalInput,
  ChargeSaleOnStandaloneTerminalOutcome,
  ChargeSaleOnStandaloneTerminalPorts,
} from "./charge-sale-on-standalone-terminal.js";
export { chargeSaleOnStandaloneTerminal } from "./charge-sale-on-standalone-terminal.js";
export type {
  CurrentSaleInput,
  CurrentSaleOutcome,
  CurrentSalePorts,
} from "./current-sale.js";
export { currentSale } from "./current-sale.js";
export type {
  ManualDiscountsQuery,
  ManualDiscountsReportReader,
} from "./manual-discounts-report-reader.js";
export type {
  PreviewSaleDiscountInput,
  PreviewSaleDiscountOutcome,
  PreviewSaleDiscountPorts,
} from "./preview-sale-discount.js";
export { previewSaleDiscount } from "./preview-sale-discount.js";
export type {
  PreviewSaleLineAdjustmentInput,
  PreviewSaleLineAdjustmentOutcome,
  PreviewSaleLineAdjustmentPorts,
} from "./preview-sale-line-adjustment.js";
export { previewSaleLineAdjustment } from "./preview-sale-line-adjustment.js";
export type {
  PrintOriginalReceiptInput,
  PrintOriginalReceiptOutcome,
  PrintOriginalReceiptPorts,
} from "./print-original-receipt.js";
export { printOriginalReceipt } from "./print-original-receipt.js";
export type {
  PrintSaleReceiptInput,
  PrintSaleReceiptOutcome,
  PrintSaleReceiptPorts,
} from "./print-sale-receipt.js";
export { printSaleReceipt } from "./print-sale-receipt.js";
export type { ProductSalesReportReader, SoldLinesQuery } from "./product-sales-report-reader.js";
export type {
  PromotionSalesQuery,
  PromotionSalesReportReader,
} from "./promotion-sales-report-reader.js";
export type {
  AverageTicketReport,
  ReadAverageTicketInput,
  TicketOfPeriod,
} from "./read-average-ticket.js";
export { readAverageTicket } from "./read-average-ticket.js";
export type {
  ManualDiscountsReport,
  ReadManualDiscountsInput,
} from "./read-manual-discounts.js";
export { readManualDiscounts } from "./read-manual-discounts.js";
export type { ReadSaleComprobantePorts } from "./read-sale-comprobante.js";
export { readSaleComprobante } from "./read-sale-comprobante.js";
export type {
  ReadSaleHistoryDetailInput,
  ReadSaleHistoryDetailOutcome,
  ReadSaleHistoryDetailPorts,
  SaleHistoryDetail,
  SaleVoidability,
} from "./read-sale-history-detail.js";
export { readSaleHistoryDetail } from "./read-sale-history-detail.js";
export type { ReadSalesByCashierInput, SalesByCashierReport } from "./read-sales-by-cashier.js";
export { readSalesByCashier } from "./read-sales-by-cashier.js";
export type { ReadSalesByDayInput, SalesByDayReport } from "./read-sales-by-day.js";
export { readSalesByDay } from "./read-sales-by-day.js";
export type {
  ReadSalesByProductAndCategoryInput,
  SalesByProductAndCategoryReport,
} from "./read-sales-by-product-and-category.js";
export { readSalesByProductAndCategory } from "./read-sales-by-product-and-category.js";
export type {
  ReadSalesByPromotionInput,
  SalesByPromotionReport,
} from "./read-sales-by-promotion.js";
export { readSalesByPromotion } from "./read-sales-by-promotion.js";
export type {
  ReadSalesHistoryInput,
  ReadSalesHistoryPorts,
  SalesHistoryPageShown,
  SalesHistoryRow,
} from "./read-sales-history.js";
export { readSalesHistory } from "./read-sales-history.js";
export type {
  SaleToPrintAtStartup,
  StartupSale,
  StartupSales,
} from "./read-sales-to-print-at-startup.js";
export { readSalesToPrintAtStartup } from "./read-sales-to-print-at-startup.js";
export type {
  ReceiptDeliveryOfInput,
  ReceiptDeliveryOfOutcome,
  ReceiptDeliveryOfPorts,
} from "./receipt-delivery-of.js";
export { receiptDeliveryOf } from "./receipt-delivery-of.js";
export type {
  ReceiptLedger,
  ReceiptLedgerTransaction,
  ReceiptPrintEnding,
  ReceiptPrinter,
  ReceiptPrinters,
  ReceiptPrintWatch,
  ReceiptReason,
  ReceiptReprint,
  ReceiptTemplate,
  StoredReceipt,
} from "./receipt-ports.js";
export type { ReceiptPrintGrant, ReceiptPrintOutcome } from "./receipt-printing.js";
export type {
  PendingMercadoPagoPaymentRefusal,
  RecordPendingMercadoPagoPaymentInput,
  RecordPendingMercadoPagoPaymentOutcome,
} from "./record-pending-mercado-pago-payment.js";
export { recordPendingMercadoPagoPayment } from "./record-pending-mercado-pago-payment.js";
export type {
  RegisterSalesHistory,
  SaleHistoryRecord,
  SalesHistoryEntry,
  SalesHistoryFilter,
  SalesHistoryPage,
} from "./register-sales-history.js";
export type {
  RemoveSaleLineInput,
  RemoveSaleLineOutcome,
  RemoveSaleLinePorts,
} from "./remove-sale-line.js";
export { removeSaleLine } from "./remove-sale-line.js";
export type {
  PendingQrPaymentReplacementRefusal,
  ReplacePendingQrPaymentInput,
  ReplacePendingQrPaymentOutcome,
  ReplacePendingQrPaymentPorts,
} from "./replace-pending-qr-payment.js";
export { replacePendingQrPayment } from "./replace-pending-qr-payment.js";
export type {
  ReprintReceiptInput,
  ReprintReceiptOutcome,
  ReprintReceiptPorts,
} from "./reprint-receipt.js";
export { reprintReceipt } from "./reprint-receipt.js";
export type {
  CandidatePromotion,
  IdGenerator,
  RegisterIdentity,
  SaleAuthorizationDecision,
  SaleLedger,
  SaleLedgerTransaction,
  SaleRefund,
  SaleStockMovement,
  SellableProduct,
  SellingSession,
} from "./sale-ledger.js";
export type { SalesByDayQuery, SalesReportReader } from "./sales-report-reader.js";
export type {
  FoundProduct,
  SearchProductsByNameInput,
  SearchProductsByNameOutcome,
  SearchProductsByNamePorts,
} from "./search-products-by-name.js";
export { searchProductsByName } from "./search-products-by-name.js";
export type {
  SettleApprovedMercadoPagoPaymentInput,
  SettleApprovedMercadoPagoPaymentOutcome,
} from "./settle-approved-mercado-pago-payment.js";
export { settleApprovedMercadoPagoPayment } from "./settle-approved-mercado-pago-payment.js";
export type {
  VoidSaleGrant,
  VoidSaleInput,
  VoidSaleOutcome,
  VoidSalePorts,
} from "./void-sale.js";
export { voidSale } from "./void-sale.js";
export type {
  SaleToVoid,
  SaleVoidLedger,
  SaleVoidTransaction,
} from "./void-sale-ports.js";
export type {
  WeighProductOnScaleInput,
  WeighProductOnScaleOutcome,
  WeighProductOnScalePorts,
} from "./weigh-product-on-scale.js";
export { weighProductOnScale } from "./weigh-product-on-scale.js";
