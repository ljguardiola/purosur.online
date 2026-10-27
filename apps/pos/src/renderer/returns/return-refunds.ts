import { formatAmountInput, parseAmountCents } from "@purosur/ui";
import type { PaymentForReturn } from "./return-sale";

export type PaymentRefundDraft = { payment: PaymentForReturn; text: string; cents: number };

export function refundDraftFor(
  payments: readonly PaymentForReturn[],
  refundableTotal: number,
  edits: Readonly<Record<string, string>>,
): PaymentRefundDraft[] {
  const firstEligible = payments.find(({ eligible }) => eligible);
  return payments.map((payment) => {
    const edited = edits[payment.payment_id];
    if (edited !== undefined) {
      return { payment, text: edited, cents: parseAmountCents(edited) ?? 0 };
    }
    const cents = payment === firstEligible ? refundableTotal : 0;
    return { payment, text: cents === 0 ? "" : formatAmountInput(cents), cents };
  });
}

export function refundsOf(draft: readonly PaymentRefundDraft[]) {
  return draft.flatMap(({ payment, cents }) =>
    cents > 0 ? [{ payment_id: payment.payment_id, amount: cents }] : [],
  );
}
