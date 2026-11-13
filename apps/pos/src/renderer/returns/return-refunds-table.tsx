import { InlineNotice, MethodRefundTable } from "@purosur/ui";
import { CircleX } from "lucide-react";
import type { LegendItem } from "../platform/key-layer";
import { paidPaymentName } from "../platform/payment-method-names";
import { refundTextsFor } from "./return-form";
import type { SaleForReturn } from "./return-sale";
import { REFUND_WHEN_IN_TABLE } from "./return-text";

export type ReturnRefundsTableProps = {
  sale: SaleForReturn;
  refundableTotal: number;
  refundEdits: Readonly<Record<string, string>>;
  selectedIndex: number;
  legend: readonly LegendItem[];
  notice: string | undefined;
  onSelect: (index: number) => void;
  onAmountChange: (paymentId: string, amount: string) => void;
};

export function ReturnRefundsTable({
  sale,
  refundableTotal,
  refundEdits,
  selectedIndex,
  legend,
  notice,
  onSelect,
  onAmountChange,
}: ReturnRefundsTableProps) {
  const rows = refundTextsFor(sale.payments, refundableTotal, refundEdits)
    .filter(({ payment }) => payment.eligible)
    .map(({ payment, text }) => ({
      id: payment.payment_id,
      method: paidPaymentName(payment.method, payment.card_type),
      when: REFUND_WHEN_IN_TABLE[payment.refund_state],
      amount: text,
    }));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <MethodRefundTable
        aria-label="Reintegro por medio de pago"
        headers={{ method: "Medio", when: "Cuándo", amount: "Reintegro" }}
        amountPrefix="$"
        rows={rows}
        selectedIndex={Math.min(selectedIndex, rows.length - 1)}
        onSelect={onSelect}
        onAmountChange={onAmountChange}
        legend={legend}
      />
      {notice === undefined ? null : (
        <InlineNotice tone="error" icon={<CircleX />} title={notice} />
      )}
    </div>
  );
}
