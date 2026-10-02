import type { CashBalance } from "@purosur/contracts";
import { formatCents, LoadFailure, LoadingPlaceholder } from "@purosur/ui";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { CoreData } from "../platform/use-core-query";
import { directedAmount } from "./cash-amounts";

export type ExpectedCashPanelProps = {
  eyebrow: string;
  balance: CoreData<CashBalance>;
  children?: ReactNode;
};

type Line = { label: string; text: string };

function linesOf(balance: CashBalance): Line[] {
  return [
    { label: "Fondo inicial", text: formatCents(balance.opening_float.amount) },
    { label: "Ventas en efectivo", text: directedAmount(balance.cash_sales) },
    { label: "Vuelto entregado", text: directedAmount(balance.change_given) },
    ...(balance.refunds.amount > 0
      ? [{ label: "Devoluciones", text: directedAmount(balance.refunds) }]
      : []),
    { label: "Ingresos", text: directedAmount(balance.cash_in) },
    { label: "Gastos", text: directedAmount(balance.expenses) },
    { label: "Retiros", text: directedAmount(balance.withdrawals) },
  ];
}

function Balance({ balance }: { balance: CashBalance }) {
  return (
    <>
      <p className="text-display font-bold text-text-accent">{formatCents(balance.expected)}</p>
      <dl className="flex flex-col gap-2 text-body">
        {linesOf(balance).map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-text-subtle">{line.label}</dt>
            <dd className="font-semibold text-text">{line.text}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

export function ExpectedCashPanel({ eyebrow, balance, children }: ExpectedCashPanelProps) {
  return (
    <aside className="flex h-full w-98 shrink-0 flex-col gap-4 border-l border-border bg-surface p-6">
      <p className="text-caption font-bold text-text-eyebrow tracking-sm">{eyebrow}</p>
      {balance.status === "loading" ? <LoadingPlaceholder variant="card" lines={4} /> : null}
      {balance.status === "failed" ? (
        <LoadFailure
          icon={<TriangleAlert />}
          title="No se pudo leer el efectivo esperado"
          description="Volvé a intentarlo en unos segundos."
          onRetry={balance.retry}
        />
      ) : null}
      {balance.status === "loaded" ? <Balance balance={balance.value} /> : null}
      <div className="flex-1" />
      {children}
    </aside>
  );
}
