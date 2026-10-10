import {
  applyMercadoPagoOrderResult,
  type MercadoPagoOrderResult,
} from "../model/mercado-pago-order-result.js";
import type { MercadoPagoQrOrderRecord } from "../model/payment-transaction.js";
import type { PaymentTransactionLane } from "./mercado-pago-qr-order-ports.js";

export async function recordMercadoPagoOrderResult(
  lane: PaymentTransactionLane,
  transaction: MercadoPagoQrOrderRecord,
  result: MercadoPagoOrderResult,
  readAt: Date,
): Promise<MercadoPagoQrOrderRecord> {
  const outcome = applyMercadoPagoOrderResult(transaction, result);
  await lane.recordOrderResult(transaction.id, outcome, readAt);
  return { ...transaction, ...outcome };
}
