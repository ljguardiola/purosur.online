import type { PendingRefundsBody } from "@purosur/contracts";
import { sortedItems, textOrder } from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useState } from "react";
import { paymentMethodLabel } from "../platform/payment-method-label";
import { ALL_METHODS, ALL_REGISTERS } from "./routes";

type Refund = PendingRefundsBody["refunds"][number];

export type FilterOption = { value: string; label: string };

export type FilterOptions = [FilterOption, ...FilterOption[]];

function sortedByLabel(options: FilterOption[]): FilterOption[] {
  return sortedItems(options, {
    order: textOrder((option) => option.label),
    direction: "ascending",
  });
}

export function registerFilterOptions(
  refunds: Pick<Refund, "register_id" | "register_name">[],
): FilterOptions {
  const registers = new Map(refunds.map((refund) => [refund.register_id, refund.register_name]));
  return [
    { value: ALL_REGISTERS, label: "Todas" },
    ...sortedByLabel([...registers].map(([value, label]) => ({ value, label }))),
  ];
}

export function methodFilterOptions(refunds: Pick<Refund, "method">[]): FilterOptions {
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
