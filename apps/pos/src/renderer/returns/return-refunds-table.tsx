import { fieldErrorMessage, InlineNotice, MethodRefundTable, useFieldContext } from "@purosur/ui";
import { CircleX } from "lucide-react";
import type { LegendItem } from "../platform/key-layer";
import { paidPaymentName } from "../platform/payment-method-names";
import type { ReturnFormValues } from "./return-form";
import { isRefundTextInvalid, refundTextsFor } from "./return-form";
import type { SaleForReturn } from "./return-sale";
import { REFUND_WHEN_IN_TABLE } from "./return-text";

export type ReturnRefundsTableProps = {
  sale: SaleForReturn;
  refundableTotal: number;
  selectedIndex: number;
  legend: readonly LegendItem[];
  notice: string | undefined;
  onSelect: (index: number) => void;
};

export function ReturnRefundsTable({
  sale,
  refundableTotal,
  selectedIndex,
  legend,
  notice,
  onSelect,
}: ReturnRefundsTableProps) {
  const field = useFieldContext<ReturnFormValues["refunds"]>();
  const errorMessage = fieldErrorMessage(field.state.meta.errors);
  const rows = refundTextsFor(sale.payments, refundableTotal, field.state.value)
    .filter(({ payment }) => payment.eligible)
    .map(({ payment, text }) => ({
      id: payment.payment_id,
      method: paidPaymentName(payment.method, payment.card_type),
      when: REFUND_WHEN_IN_TABLE[payment.refund_state],
      amount: text,
      invalid: errorMessage !== undefined && isRefundTextInvalid(text),
    }));
  const shown = errorMessage ?? notice;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <MethodRefundTable
        aria-label="Reintegro por medio de pago"
        headers={{ method: "Medio", when: "Cuándo", amount: "Reintegro" }}
        amountPrefix="$"
        rows={rows}
        selectedIndex={Math.min(selectedIndex, rows.length - 1)}
        onSelect={onSelect}
        onAmountChange={(paymentId, amount) =>
          field.handleChange((current) => ({ ...current, [paymentId]: amount }))
        }
        legend={legend}
      />
      {shown === undefined ? null : <InlineNotice tone="error" icon={<CircleX />} title={shown} />}
    </div>
  );
}
