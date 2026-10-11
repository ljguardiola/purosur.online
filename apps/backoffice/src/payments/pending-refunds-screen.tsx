import type { PendingRefundsBody } from "@purosur/contracts";
import {
  actionsColumn,
  dataColumn,
  formatCents,
  formatTimeAgoInHours,
  ListFilter,
  sortedItems,
  Table,
  TableCellText,
  textOrder,
  useTableModel,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { CircleCheck, CircleX, HandCoins } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import { DiscardRefundModal } from "./discard-refund-modal";
import { MarkRefundDoneModal } from "./mark-refund-done-modal";
import { usePendingRefundsQuery, useRefreshPayments } from "./payments-queries";
import type { PendingRefundsScreenServices } from "./pending-refunds-services";
import { refundMethodLabel } from "./refund-method-label";
import { refundDate } from "./refund-moments";
import { refundReason } from "./refund-reason";
import { ALL_REGISTERS, type PendingRefundsFilters } from "./routes";

export type PendingRefundsScreenProps = {
  filters: PendingRefundsFilters;
  onFiltersChange: (filters: PendingRefundsFilters) => void;
  onSessionEnded: () => void;
  services: PendingRefundsScreenServices;
};

type RegisterOption = { value: string; label: string };

type PendingRefund = PendingRefundsBody["refunds"][number];

const NO_REFUNDS: PendingRefund[] = [];

export function PendingRefundsScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: PendingRefundsScreenProps) {
  const data = usePendingRefundsQuery({
    fetchPendingRefunds: services.fetchPendingRefunds,
    onSessionEnded,
  });
  const refreshPayments = useRefreshPayments();
  const [doneTarget, setDoneTarget] = useState<PendingRefund | null>(null);
  const [discardTarget, setDiscardTarget] = useState<PendingRefund | null>(null);
  const refunds = data.status === "loaded" ? data.value.refunds : NO_REFUNDS;
  const [registerFilter, setRegisterFilter] = useState(filters.register);

  const reportFilters = useEffectEvent(onFiltersChange);

  useEffect(() => {
    const shown: PendingRefundsFilters = { register: registerFilter };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [registerFilter, filters]);

  const registers = new Map(refunds.map((refund) => [refund.register_id, refund.register_name]));
  const registerOptions: [RegisterOption, ...RegisterOption[]] = [
    { value: ALL_REGISTERS, label: "Todas" },
    ...sortedItems(
      [...registers].map(([value, label]) => ({ value, label })),
      {
        order: textOrder((option) => option.label),
        direction: "ascending",
      },
    ),
  ];
  const registerIsOffered = registers.has(registerFilter);
  const shownRegister = registerIsOffered ? registerFilter : ALL_REGISTERS;

  useEffect(() => {
    if (data.status === "loaded" && !registerIsOffered) {
      setRegisterFilter(ALL_REGISTERS);
    }
  }, [data.status, registerIsOffered]);

  const columns = [
    dataColumn({
      id: "pendingSince",
      header: "Pendiente desde",
      render: (refund: PendingRefund) => (
        <TableCellText description={formatTimeAgoInHours(refund.seconds_pending)}>
          {refundDate(refund.occurred_at)}
        </TableCellText>
      ),
    }),
    dataColumn({
      id: "reason",
      header: "Por qué",
      render: (refund: PendingRefund) => {
        const { title, detail } = refundReason(refund);
        return <TableCellText description={detail}>{title}</TableCellText>;
      },
    }),
    dataColumn({
      id: "method",
      header: "Medio",
      render: (refund: PendingRefund) => refundMethodLabel(refund.method),
    }),
    dataColumn({
      id: "amount",
      header: "Importe",
      align: "end",
      render: (refund: PendingRefund) => formatCents(refund.amount),
    }),
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
    filter: (refund) => shownRegister === ALL_REGISTERS || refund.register_id === shownRegister,
  });

  return (
    <>
      <ScreenLayout
        topBar={<ScreenTopBar eyebrow="Caja" title="Reembolsos pendientes" />}
        bodyClassName="gap-4 p-6"
      >
        <div className="flex flex-wrap items-center gap-3">
          <ListFilter
            name="register"
            label="Caja"
            options={registerOptions}
            value={shownRegister}
            onChange={setRegisterFilter}
          />
        </div>
        <Table
          aria-label="Reembolsos pendientes"
          table={table}
          {...cloudTableState(data, "los reembolsos pendientes")}
          empty={{
            icon: <HandCoins />,
            title: "Sin reembolsos pendientes",
            description: "Todos los reembolsos hechos fuera del sistema están marcados.",
            variant: "blank",
          }}
          footer={
            <p className="text-text-subtle text-detail">
              Se hacen fuera del sistema y acá se marcan como hechos
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
