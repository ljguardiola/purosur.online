import {
  expiryWithoutOrder,
  type MercadoPagoQrOrderTransaction,
} from "../model/payment-transaction.js";
import type { PaymentTransactionLane } from "./mercado-pago-qr-order-ports.js";

export async function recordExpiryWithoutOrder(
  lane: PaymentTransactionLane,
  transaction: MercadoPagoQrOrderTransaction,
  now: Date,
): Promise<MercadoPagoQrOrderTransaction | null> {
  const expiry = expiryWithoutOrder(transaction, now);
  if (expiry === null) {
    return null;
  }
  if (expiry === "expired") {
    await lane.recordExpired(transaction.id);
    return { ...transaction, state: "EXPIRED" };
  }
  if (!transaction.needsReview) {
    await lane.recordNeedsReview(transaction.id);
  }
  return { ...transaction, needsReview: true };
}
