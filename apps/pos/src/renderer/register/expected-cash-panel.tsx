import type { CashBalance } from "@purosur/contracts";
import type { SummaryRowGroupProps } from "@purosur/ui";
import {
  FigureStat,
  formatCents,
  LoadFailure,
  LoadingPlaceholder,
  SidePanel,
  SummaryRowGroup,
} from "@purosur/ui";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { CoreData } from "../platform/use-core-query";
import { directedAmount } from "./cash-amounts";

export type ExpectedCashPanelProps = {
  eyebrow: string;
  balance: CoreData<CashBalance>;
  children?: ReactNode;
};

function rowsOf(balance: CashBalance): SummaryRowGroupProps["rows"] {
  return [
    { label: "Fondo inicial", value: formatCents(balance.opening_float.amount) },
    { label: "Ventas en efectivo", value: directedAmount(balance.cash_sales) },
    { label: "Vuelto entregado", value: directedAmount(balance.change_given) },
    ...(balance.refunds.amount > 0
      ? [{ label: "Devoluciones", value: directedAmount(balance.refunds) }]
      : []),
    { label: "Ingresos", value: directedAmount(balance.cash_in) },
    { label: "Gastos", value: directedAmount(balance.expenses) },
    { label: "Retiros", value: directedAmount(balance.withdrawals) },
  ];
}

function Balance({ eyebrow, balance }: { eyebrow: string; balance: CashBalance }) {
  return (
    <>
      <FigureStat label={eyebrow} value={formatCents(balance.expected)} />
      <SummaryRowGroup rows={rowsOf(balance)} />
    </>
  );
}

export function ExpectedCashPanel({ eyebrow, balance, children }: ExpectedCashPanelProps) {
  return (
    <SidePanel footer={children ?? undefined}>
      {balance.status === "loading" ? (
        <>
          <FigureStat label={eyebrow} loading />
          <LoadingPlaceholder variant="card" lines={4} />
        </>
      ) : null}
      {balance.status === "failed" ? (
        <LoadFailure
          icon={<TriangleAlert />}
          title="No se pudo leer el efectivo esperado"
          description="Volvé a intentarlo en unos segundos."
          onRetry={balance.retry}
        />
      ) : null}
      {balance.status === "loaded" ? <Balance eyebrow={eyebrow} balance={balance.value} /> : null}
    </SidePanel>
  );
}
