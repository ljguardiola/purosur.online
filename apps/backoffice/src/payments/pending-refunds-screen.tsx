import type { ConfirmedRefundBody, PendingRefundsBody } from "@purosur/contracts";
import {
  actionsColumn,
  dataColumn,
  FloatingNotification,
  formatCents,
  formatTimeAgoInHours,
  ListFilter,
  type NoticeTone,
  sortedItems,
  Table,
  TableCellText,
  textOrder,
  useTableModel,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { Check, CircleCheck, CircleX, HandCoins, Send, TriangleAlert } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { paymentMethodLabel } from "../platform/payment-method-label";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import { DiscardRefundModal } from "./discard-refund-modal";
import { MarkRefundDoneModal } from "./mark-refund-done-modal";
import { usePendingRefundsQuery, useRefreshPayments } from "./payments-queries";
import type { PendingRefundsScreenServices } from "./pending-refunds-services";
import { refundConfirmationNotice } from "./refund-confirmation-notice";
import { refundDeliveryStatus } from "./refund-delivery-status";
import { refundDate } from "./refund-moments";
import { refundReason } from "./refund-reason";
import { ALL_REGISTERS, type PendingRefundsFilters } from "./routes";
import { SendRefundModal } from "./send-refund-modal";

export type PendingRefundsScreenProps = {
  filters: PendingRefundsFilters;
  onFiltersChange: (filters: PendingRefundsFilters) => void;
  onSessionEnded: () => void;
  services: PendingRefundsScreenServices;
};

type RegisterOption = { value: string; label: string };

type PendingRefund = PendingRefundsBody["refunds"][number];

type ScreenNotice = {
  id: number;
  tone: NoticeTone;
  title: string;
  description: string;
};

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
  const [sendTarget, setSendTarget] = useState<PendingRefund | null>(null);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const lastNoticeId = useRef(0);
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

  function showConfirmation(body: ConfirmedRefundBody) {
    lastNoticeId.current += 1;
    setNotice({ ...refundConfirmationNotice(body), id: lastNoticeId.current });
  }

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
      render: (refund: PendingRefund) => {
        const status = refundDeliveryStatus(refund);
        const order =
          refund.provider_order_id === null ? null : `Orden ${refund.provider_order_id}`;
        const description = [status, order].filter((part) => part !== null).join(" · ") || null;
        return description === null ? (
          paymentMethodLabel(refund.method)
        ) : (
          <TableCellText description={description}>
            {paymentMethodLabel(refund.method)}
          </TableCellText>
        );
      },
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
        (refund: PendingRefund) => {
          if (!refund.sent_by_cloud) {
            return {
              icon: <CircleCheck />,
              "aria-label": `Marcar como hecho el reembolso de ${formatCents(refund.amount)}`,
              onPress: () => setDoneTarget(refund),
            };
          }
          return refund.delivery_stage === "unconfirmed"
            ? {
                icon: <Send />,
                "aria-label": `Enviar a Mercado Pago el reembolso de ${formatCents(refund.amount)}`,
                onPress: () => setSendTarget(refund),
              }
            : undefined;
        },
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
              Los reembolsos de pagos con QR de ventas canceladas y de aprobaciones tardías se
              envían a Mercado Pago desde acá; los demás se hacen fuera del sistema y acá se marcan
              como hechos. Nada se envía a Mercado Pago sin confirmarlo acá.
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
      <SendRefundModal
        target={sendTarget}
        onClose={() => setSendTarget(null)}
        onConfirmed={(body) => {
          setSendTarget(null);
          showConfirmation(body);
          void refreshPayments();
        }}
        onOutdated={() => {
          setSendTarget(null);
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
      {notice ? (
        <FloatingNotification
          key={notice.id}
          tone={notice.tone}
          icon={notice.tone === "success" ? <Check /> : <TriangleAlert />}
          title={notice.title}
          description={notice.description}
          onDismiss={() => setNotice(null)}
        />
      ) : null}
    </>
  );
}
