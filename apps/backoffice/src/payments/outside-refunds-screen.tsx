import { actionsColumn, formatCents, ListFilter, Table, useTableModel } from "@purosur/ui";
import { CircleCheck, CircleX, HandCoins, Search } from "lucide-react";
import { useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import { DiscardRefundModal } from "./discard-refund-modal";
import { MarkRefundDoneModal } from "./mark-refund-done-modal";
import type { OutsideRefundsScreenServices } from "./outside-refunds-services";
import { usePendingRefundsQuery, useRefreshPayments } from "./payments-queries";
import {
  amountColumn,
  methodColumn,
  methodFilterOptions,
  type PendingRefund,
  pendingSinceColumn,
  reasonColumn,
  registerFilterOptions,
  useOfferedChoice,
  useReportedFilters,
} from "./payments-screen-parts";
import { madeOutsideTheSystem } from "./refund-kinds";
import { ALL_METHODS, ALL_REGISTERS, type OutsideRefundsFilters } from "./routes";

export type OutsideRefundsScreenProps = {
  filters: OutsideRefundsFilters;
  onFiltersChange: (filters: OutsideRefundsFilters) => void;
  onSessionEnded: () => void;
  services: OutsideRefundsScreenServices;
};

const NO_REFUNDS: PendingRefund[] = [];

export function OutsideRefundsScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: OutsideRefundsScreenProps) {
  const data = usePendingRefundsQuery({
    fetchPendingRefunds: services.fetchPendingRefunds,
    onSessionEnded,
  });
  const refreshPayments = useRefreshPayments();
  const [doneTarget, setDoneTarget] = useState<PendingRefund | null>(null);
  const [discardTarget, setDiscardTarget] = useState<PendingRefund | null>(null);
  const refunds = data.status === "loaded" ? madeOutsideTheSystem(data.value.refunds) : NO_REFUNDS;
  const settled = data.status === "loaded";

  const registerOptions = registerFilterOptions(refunds);
  const methodOptions = methodFilterOptions(refunds);
  const register = useOfferedChoice({
    chosen: filters.register,
    options: registerOptions,
    settled,
  });
  const method = useOfferedChoice({ chosen: filters.method, options: methodOptions, settled });
  useReportedFilters(
    { register: register.choice, method: method.choice },
    filters,
    onFiltersChange,
  );

  const columns = [
    pendingSinceColumn,
    reasonColumn,
    methodColumn,
    amountColumn,
    actionsColumn({
      id: "actions",
      header: "Acciones",
      actions: [
        (refund: PendingRefund) => ({
          icon: <CircleCheck />,
          "aria-label": `Marcar como hecho el reembolso de ${formatCents(refund.amount)}`,
          onPress: () => setDoneTarget(refund),
        }),
        (refund: PendingRefund) =>
          refund.discardable
            ? {
                icon: <CircleX />,
                "aria-label": `Descartar el reembolso de ${formatCents(refund.amount)}`,
                onPress: () => setDiscardTarget(refund),
              }
            : undefined,
      ],
    }),
  ] as const;

  const table = useTableModel({
    items: refunds,
    id: (refund) => refund.id,
    columns,
    filter: (refund) =>
      (register.shown === ALL_REGISTERS || refund.register_id === register.shown) &&
      (method.shown === ALL_METHODS || refund.method === method.shown),
  });

  return (
    <>
      <ScreenLayout
        topBar={<ScreenTopBar eyebrow="Caja y fiscal · Tareas" title="Reembolsos sin API" />}
        bodyClassName="gap-4 p-6"
      >
        <div className="flex flex-wrap items-center gap-3">
          <ListFilter
            name="register"
            label="Caja"
            options={registerOptions}
            value={register.shown}
            onChange={register.setChoice}
          />
          <ListFilter
            name="method"
            label="Medio"
            options={methodOptions}
            value={method.shown}
            onChange={method.setChoice}
          />
        </div>
        <Table
          aria-label="Reembolsos sin API"
          table={table}
          {...cloudTableState(data, "los reembolsos sin API")}
          empty={
            refunds.length === 0
              ? {
                  icon: <HandCoins />,
                  title: "Sin reembolsos pendientes",
                  description: "Todos los reembolsos hechos fuera del sistema están marcados.",
                  variant: "blank",
                }
              : {
                  icon: <Search />,
                  title: "No hay reembolsos pendientes con estos filtros",
                  description: "Probá con otra caja o con otro medio.",
                  variant: "filtered",
                }
          }
          footer={
            <p className="text-text-subtle text-detail">
              Se hacen fuera del sistema y acá se marcan como hechos.
            </p>
          }
        />
      </ScreenLayout>
      <MarkRefundDoneModal
        target={doneTarget}
        onClose={() => setDoneTarget(null)}
        onDone={() => {
          setDoneTarget(null);
          void refreshPayments();
        }}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <DiscardRefundModal
        target={discardTarget}
        onClose={() => setDiscardTarget(null)}
        onDone={() => {
          setDiscardTarget(null);
          void refreshPayments();
        }}
        onSessionEnded={onSessionEnded}
        services={services}
      />
    </>
  );
}
