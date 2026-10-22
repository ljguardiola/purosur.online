import { PillLink } from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import { Hourglass } from "lucide-react";
import { useUnbilledDeferredSalesQuery } from "./fiscal-queries";
import {
  defaultUnbilledDeferredSalesPillServices,
  type UnbilledDeferredSalesPillServices,
} from "./unbilled-deferred-sales-pill-services";
import { unbilledDeferredSalesText } from "./unbilled-deferred-sales-text";

const FiscalTasksLink = createLink(PillLink);

export type UnbilledDeferredSalesPillProps = {
  onSessionEnded: () => void;
  services?: UnbilledDeferredSalesPillServices | undefined;
};

export function UnbilledDeferredSalesPill({
  onSessionEnded,
  services,
}: UnbilledDeferredSalesPillProps) {
  const sales = useUnbilledDeferredSalesQuery({
    fetchUnbilledDeferredSales: (services ?? defaultUnbilledDeferredSalesPillServices)
      .fetchUnbilledDeferredSales,
    onSessionEnded,
  });
  if (sales.status !== "loaded" || sales.value.count === 0) {
    return null;
  }
  return (
    <div className="flex h-18 shrink-0 items-center border-border border-b bg-surface pr-8">
      <FiscalTasksLink to="/fiscal-tasks" tone="warning" icon={<Hourglass />}>
        {unbilledDeferredSalesText(sales.value)}
      </FiscalTasksLink>
    </div>
  );
}
