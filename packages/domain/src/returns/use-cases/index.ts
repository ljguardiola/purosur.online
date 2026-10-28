export type { Clock, OperationAuthority, OperationAuthorization } from "../../shared/index.js";
export type {
  CompleteReturnGrant,
  CompleteReturnInput,
  CompleteReturnOutcome,
  CompleteReturnPorts,
} from "./complete-return.js";
export { completeReturn } from "./complete-return.js";
export type {
  FindBranchSaleForReturnInput,
  FindBranchSaleForReturnOutcome,
  FindBranchSaleForReturnPorts,
} from "./find-branch-sale-for-return.js";
export { findBranchSaleForReturn } from "./find-branch-sale-for-return.js";
export type {
  FindSaleForReturnInput,
  FindSaleForReturnOutcome,
  ReturnableLineView,
  SaleForReturnView,
} from "./find-sale-for-return.js";
export type {
  PreviewReturnInput,
  PreviewReturnOutcome,
  PreviewReturnPorts,
} from "./preview-return.js";
export { previewReturn } from "./preview-return.js";
export type { ReadReturnsReportInput, ReturnsReport } from "./read-returns-report.js";
export { readReturnsReport } from "./read-returns-report.js";
export type {
  BranchSaleFacts,
  BranchSaleForReturnReader,
  BranchSaleLookup,
  BranchSaleLookupAnswer,
  IdGenerator,
  KeptBranchSale,
  OwnReturnsOfSale,
  RecordedReturn,
  RetainedBranchSales,
  ReturnCashMovement,
  ReturningSession,
  ReturnLedger,
  ReturnRefund,
  ReturnSaleReader,
  ReturnStockMovement,
  ReturnTransaction,
  SaleReturnSearch,
} from "./return-ports.js";
export type { ReturnsReportQuery, ReturnsReportReader } from "./returns-report-reader.js";
