import type { MercadoPagoPaymentTransaction } from "./payment-transaction.js";

export function mercadoPagoPaymentIsBacked(
  payment: { saleId: string; amount: number; method: MercadoPagoPaymentTransaction["method"] },
  transaction: Pick<MercadoPagoPaymentTransaction, "saleId" | "amount" | "state" | "method"> | null,
): boolean {
  return (
    transaction !== null &&
    transaction.state === "APPROVED" &&
    transaction.saleId === payment.saleId &&
    transaction.amount === payment.amount &&
    transaction.method === payment.method
  );
}
