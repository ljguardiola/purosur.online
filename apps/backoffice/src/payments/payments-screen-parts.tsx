import type { PendingRefundsBody } from "@purosur/contracts";
import {
  dataColumn,
  formatCents,
  formatTimeAgoInHours,
  sortedItems,
  TableCellText,
  textOrder,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useState } from "react";
import { paymentMethodLabel } from "../platform/payment-method-label";
import { refundDeliveryStatus } from "./refund-delivery-status";
import { refundDate } from "./refund-moments";
import { refundReason } from "./refund-reason";
import { ALL_METHODS, ALL_REGISTERS } from "./routes";

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

export const methodColumn = dataColumn({
  id: "method",
  header: "Medio",
  render: (refund: PendingRefund) => {
    const status = refundDeliveryStatus(refund);
    const order = refund.provider_order_id === null ? null : `Orden ${refund.provider_order_id}`;
    const description = [status, order].filter((part) => part !== null).join(" · ") || null;
    return description === null ? (
      paymentMethodLabel(refund.method)
    ) : (
      <TableCellText description={description}>{paymentMethodLabel(refund.method)}</TableCellText>
    );
  },
});

export const amountColumn = dataColumn({
  id: "amount",
  header: "Importe",
  align: "end",
  render: (refund: PendingRefund) => formatCents(refund.amount),
});

export type FilterOption = { value: string; label: string };

export type FilterOptions = [FilterOption, ...FilterOption[]];

function sortedByLabel(options: FilterOption[]): FilterOption[] {
  return sortedItems(options, {
    order: textOrder((option) => option.label),
    direction: "ascending",
  });
}

export function registerFilterOptions(
  refunds: Pick<PendingRefund, "register_id" | "register_name">[],
): FilterOptions {
  const registers = new Map(refunds.map((refund) => [refund.register_id, refund.register_name]));
  return [
    { value: ALL_REGISTERS, label: "Todas" },
    ...sortedByLabel([...registers].map(([value, label]) => ({ value, label }))),
  ];
}

export function methodFilterOptions(refunds: Pick<PendingRefund, "method">[]): FilterOptions {
  const methods = new Set(refunds.map((refund) => refund.method));
  return [
    { value: ALL_METHODS, label: "Todos" },
    ...sortedByLabel([...methods].map((value) => ({ value, label: paymentMethodLabel(value) }))),
  ];
}

export function useOfferedChoice({
  chosen,
  options,
  settled,
}: {
  chosen: string;
  options: FilterOptions;
  settled: boolean;
}) {
  const [choice, setChoice] = useState(chosen);
  const fallback = options[0].value;
  const isOffered = options.some((option) => option.value === choice);

  useEffect(() => {
    if (settled && !isOffered) {
      setChoice(fallback);
    }
  }, [settled, isOffered, fallback]);

  return { choice, shown: isOffered ? choice : fallback, setChoice };
}

export function useReportedFilters<F extends object>(
  chosen: F,
  current: F,
  onFiltersChange: (filters: F) => void,
) {
  const report = useEffectEvent(onFiltersChange);

  useEffect(() => {
    if (!deepEqual(chosen, current)) {
      report(chosen);
    }
  }, [chosen, current]);
}
