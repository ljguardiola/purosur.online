import { paymentMethodName } from "../platform/payment-method-names";
import type { Refund } from "./refund-lines";

function refundMethodName(method: Refund["method"]): string {
  return method === "QR" ? "QR" : paymentMethodName(method);
}

export function refundLabel(refund: Refund): string {
  const when = refund.state === "PENDING" ? "reembolso pendiente" : "en el acto";
  return `${refundMethodName(refund.method)} · ${when}`;
}
