import { LoadFailure, LoadingPlaceholder, PillLink } from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import { Hourglass } from "lucide-react";
import type { ReactNode } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
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
  if (sales.status === "loading") {
    return (
      <TopBarSlot>
        <LoadingPlaceholder variant="pill" />
      </TopBarSlot>
    );
  }
  if (sales.status === "failed") {
    return (
      <TopBarSlot>
        <LoadFailure
          variant="pill"
          {...cloudLoadFailure(sales, "las ventas diferidas sin facturar")}
        />
      </TopBarSlot>
    );
  }
  if (sales.value.count === 0) {
    return null;
  }
  return (
    <TopBarSlot>
      <FiscalTasksLink to="/fiscal-tasks" tone="warning" icon={<Hourglass />}>
        {unbilledDeferredSalesText(sales.value)}
      </FiscalTasksLink>
    </TopBarSlot>
  );
}

function TopBarSlot({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-18 shrink-0 items-center border-border border-b bg-surface pr-8">
      {children}
    </div>
  );
}
