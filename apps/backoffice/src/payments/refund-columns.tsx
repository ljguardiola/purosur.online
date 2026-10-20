import type { PendingRefundsBody } from "@purosur/contracts";
import { dataColumn, formatCents, formatTimeAgoInHours, TableCellText } from "@purosur/ui";
import { refundDate } from "./refund-moments";
import { refundReason } from "./refund-reason";

export type PendingRefund = PendingRefundsBody["refunds"][number];

export const pendingSinceColumn = dataColumn({
  id: "pendingSince",
  header: "Pendiente desde",
  render: (refund: PendingRefund) => (
    <TableCellText description={formatTimeAgoInHours(refund.seconds_pending)}>
      {refundDate(refund.occurred_at)}
    </TableCellText>
  ),
});

export const reasonColumn = dataColumn({
  id: "reason",
  header: "Por qué",
  render: (refund: PendingRefund) => {
    const { title, detail } = refundReason(refund);
    return <TableCellText description={detail}>{title}</TableCellText>;
  },
});

export const amountColumn = dataColumn({
  id: "amount",
  header: "Importe",
  align: "end",
  render: (refund: PendingRefund) => formatCents(refund.amount),
});
