import type { ProviderPaymentTransaction } from "./payment-transaction.js";

export function qrPaymentIsBacked(
  payment: { saleId: string; amount: number },
  transaction: Pick<ProviderPaymentTransaction, "saleId" | "amount" | "state"> | null,
): boolean {
  return (
    transaction !== null &&
    transaction.state === "APPROVED" &&
    transaction.saleId === payment.saleId &&
    transaction.amount === payment.amount
  );
}
