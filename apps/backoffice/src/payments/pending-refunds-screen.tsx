import { type PendingRefundsBody, pendingRefundsSchema } from "@purosur/contracts";
import {
  actionsColumn,
  dataColumn,
  formatCents,
  formatDate,
  Table,
  useTableModel,
} from "@purosur/ui";
import { CircleCheck, HandCoins } from "lucide-react";
import { useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { schemaText } from "../platform/schema-text";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import { MarkRefundDoneModal } from "./mark-refund-done-modal";
import { usePendingRefundsQuery, useRefreshPayments } from "./payments-queries";
import type { PendingRefundsScreenServices } from "./pending-refunds-services";
import { refundMethodLabel } from "./refund-method-label";

export type PendingRefundsScreenProps = {
  onSessionEnded: () => void;
  services: PendingRefundsScreenServices;
};

type PendingRefund = PendingRefundsBody["refunds"][number];

const NO_REFUNDS: PendingRefund[] = [];

const REFUND_TIME_ZONE = schemaText(
  pendingRefundsSchema.shape.refunds.element.shape.occurred_at.meta()?.["timeZone"],
);

const NO_NAME = "Sin dato";

function refundMoment(refund: PendingRefund): string {
  const moment = new Date(refund.occurred_at);
  const date = formatDate(moment, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: REFUND_TIME_ZONE,
  });
  const time = formatDate(moment, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: REFUND_TIME_ZONE,
  });
  return `${date} ${time}`;
}

export function PendingRefundsScreen({ onSessionEnded, services }: PendingRefundsScreenProps) {
  const data = usePendingRefundsQuery({
    fetchPendingRefunds: services.fetchPendingRefunds,
    onSessionEnded,
  });
  const refreshPayments = useRefreshPayments();
  const [doneTarget, setDoneTarget] = useState<PendingRefund | null>(null);
  const refunds = data.status === "loaded" ? data.value.refunds : NO_REFUNDS;

  const columns = [
    dataColumn({ id: "moment", header: "Cancelada", render: refundMoment }),
    dataColumn({
      id: "register",
      header: "Caja",
      render: (refund: PendingRefund) => refund.register_name,
    }),
    dataColumn({
      id: "method",
      header: "Método",
      render: (refund: PendingRefund) => refundMethodLabel(refund.method),
    }),
    dataColumn({
      id: "amount",
      header: "Importe",
      align: "end",
      render: (refund: PendingRefund) => formatCents(refund.amount),
    }),
    dataColumn({
      id: "cancelledBy",
      header: "Cancelada por",
      render: (refund: PendingRefund) => refund.cancelled_by_name ?? NO_NAME,
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
      ],
    }),
  ] as const;

  const table = useTableModel({ items: refunds, id: (refund) => refund.id, columns });

  return (
    <>
      <ScreenLayout
        topBar={<ScreenTopBar eyebrow="Caja" title="Reembolsos pendientes" />}
        bodyClassName="gap-4 p-6"
      >
        <Table
          aria-label="Reembolsos pendientes"
          table={table}
          {...cloudTableState(data, "los reembolsos pendientes")}
          empty={{
            icon: <HandCoins />,
            title: "No hay reembolsos pendientes",
            variant: "blank",
          }}
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
    </>
  );
}
