export type { AppliedStockMovement } from "./apply-stock-movement.js";
export type { RecordAdjustmentInput, RecordAdjustmentOutcome } from "./record-adjustment.js";
export { recordAdjustment } from "./record-adjustment.js";
export type { RecordLossInput, RecordLossOutcome } from "./record-loss.js";
export { recordLoss } from "./record-loss.js";
export type { RegisterCountInput, RegisterCountOutcome } from "./register-count.js";
export { registerCount } from "./register-count.js";
export type {
  Clock,
  CoveringCount,
  LockProductStockResult,
  NewStockCount,
  NewStockMovement,
  ProductStockKey,
  StockMovementKind,
  StockPorts,
  StockStore,
  StockStoreTransaction,
} from "./stock-store.js";
