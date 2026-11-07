import type { ConfirmedRefundBody } from "@purosur/contracts";
import {
  actionsColumn,
  FloatingNotification,
  formatCents,
  ListFilter,
  type NoticeTone,
  Table,
  useTableModel,
} from "@purosur/ui";
import {
  Check,
  CircleCheck,
  CircleX,
  HandCoins,
  Landmark,
  Search,
  Send,
  TriangleAlert,
} from "lucide-react";
import { useRef, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { DiscardRefundModal } from "./discard-refund-modal";
import { MarkRefundDoneModal } from "./mark-refund-done-modal";
import { usePendingRefundsQuery, useRefreshPayments } from "./payments-queries";
import {
  amountColumn,
  type FilterOptions,
  methodColumn,
  methodFilterOptions,
  type PendingRefund,
  pendingSinceColumn,
  reasonColumn,
  registerFilterOptions,
  useOfferedChoice,
  useReportedFilters,
} from "./payments-screen-parts";
import type { PendingRefundsScreenServices } from "./pending-refunds-services";
import { refundConfirmationNotice } from "./refund-confirmation-notice";
import { madeOutsideTheSystem, sentToMercadoPago } from "./refund-kinds";
import {
  ALL_METHODS,
  ALL_REGISTERS,
  type PENDING_REFUNDS_CHANNELS,
  type PendingRefundsFilters,
  pendingRefundsFilters,
} from "./routes";
import { SendRefundModal } from "./send-refund-modal";
import { TransferRefundModal } from "./transfer-refund-modal";

export type PendingRefundsScreenProps = {
  filters: PendingRefundsFilters;
  onFiltersChange: (filters: PendingRefundsFilters) => void;
  onSessionEnded: () => void;
  services: PendingRefundsScreenServices;
};

type ScreenNotice = {
  id: number;
  tone: NoticeTone;
  title: string;
  description: string;
};

type Channel = (typeof PENDING_REFUNDS_CHANNELS)[number];

const NO_REFUNDS: PendingRefund[] = [];

const CHANNEL_OPTIONS: FilterOptions = [
  { value: "all", label: "Todos" },
  { value: "mercado-pago", label: "Mercado Pago" },
  { value: "without-api", label: "Sin API" },
];

function refundsOfChannel(refunds: PendingRefund[], channel: Channel): PendingRefund[] {
  switch (channel) {
    case "mercado-pago":
      return sentToMercadoPago(refunds);
    case "without-api":
      return madeOutsideTheSystem(refunds);
    case "all":
      return refunds;
  }
}

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
  const [discardTarget, setDiscardTarget] = useState<PendingRefund | null>(null);
  const [transferTarget, setTransferTarget] = useState<PendingRefund | null>(null);
  const [sendTarget, setSendTarget] = useState<PendingRefund | null>(null);
  const [doneTarget, setDoneTarget] = useState<PendingRefund | null>(null);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const lastNoticeId = useRef(0);
  const settled = data.status === "loaded";

  const channel = useOfferedChoice({
    chosen: filters.channel,
    options: CHANNEL_OPTIONS,
    settled: true,
  });
  const channelShown = pendingRefundsFilters.shape.channel.parse(channel.shown);
  const refunds = settled ? refundsOfChannel(data.value.refunds, channelShown) : NO_REFUNDS;

  const registerOptions = registerFilterOptions(refunds);
  const methodOptions = methodFilterOptions(refunds);
  const register = useOfferedChoice({
    chosen: filters.register,
    options: registerOptions,
    settled,
  });
  const method = useOfferedChoice({ chosen: filters.method, options: methodOptions, settled });
  useReportedFilters(
    {
      channel: pendingRefundsFilters.shape.channel.parse(channel.choice),
      register: register.choice,
      method: method.choice,
    },
    filters,
    onFiltersChange,
  );

  function showConfirmation(body: ConfirmedRefundBody) {
    lastNoticeId.current += 1;
    setNotice({ ...refundConfirmationNotice(body), id: lastNoticeId.current });
  }

  const columns = [
    pendingSinceColumn,
    reasonColumn,
    methodColumn,
    amountColumn,
    actionsColumn({
      id: "actions",
      header: "Acciones",
      actions: [
        (refund: PendingRefund) =>
          refund.sent_by_cloud && refund.delivery_stage === "unconfirmed"
            ? {
                icon: <Send />,
                "aria-label": `Enviar a Mercado Pago el reembolso de ${formatCents(refund.amount)}`,
                onPress: () => setSendTarget(refund),
              }
            : undefined,
        (refund: PendingRefund) =>
          refund.sent_by_cloud && refund.transferable
            ? {
                icon: <Landmark />,
                "aria-label": `Registrar la devolución por transferencia del reembolso de ${formatCents(refund.amount)}`,
                onPress: () => setTransferTarget(refund),
              }
            : undefined,
        (refund: PendingRefund) =>
          refund.sent_by_cloud
            ? undefined
            : {
                icon: <CircleCheck />,
                "aria-label": `Marcar como hecho el reembolso de ${formatCents(refund.amount)}`,
                onPress: () => setDoneTarget(refund),
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
    filter: (refund) =>
      (register.shown === ALL_REGISTERS || refund.register_id === register.shown) &&
      (method.shown === ALL_METHODS || refund.method === method.shown),
  });

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <ListFilter
            name="channel"
            label="Canal"
            options={CHANNEL_OPTIONS}
            value={channel.shown}
            onChange={channel.setChoice}
          />
          <ListFilter
            name="register"
            label="Caja"
            searchable
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
          aria-label="Reembolsos pendientes"
          table={table}
          {...cloudTableState(data, "los reembolsos pendientes")}
          empty={
            refunds.length === 0
              ? {
                  icon: <HandCoins />,
                  title: "Sin reembolsos pendientes",
                  description: "Nada espera para enviarse ni para marcarse como hecho.",
                  variant: "blank",
                }
              : {
                  icon: <Search />,
                  title: "No hay reembolsos pendientes con estos filtros",
                  description: "Probá con otro canal, otra caja o otro medio.",
                  variant: "filtered",
                }
          }
          footer={
            <div className="flex flex-col gap-2 text-text-subtle text-detail">
              {channelShown === "without-api" ? null : (
                <p>
                  Los reembolsos con QR o Point de ventas canceladas, y con QR de aprobaciones
                  tardías, se envían a Mercado Pago recién cuando se confirman acá. Los de ventas
                  anuladas con QR o Point los confirmó en la caja quien anuló la venta, y se envían
                  sin pasar por acá.
                </p>
              )}
              {channelShown === "mercado-pago" ? null : (
                <p>Se hacen fuera del sistema y acá se marcan como hechos.</p>
              )}
            </div>
          }
        />
      </div>
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
      <TransferRefundModal
        target={transferTarget}
        onClose={() => setTransferTarget(null)}
        onDone={() => {
          setTransferTarget(null);
          void refreshPayments();
        }}
        onSessionEnded={onSessionEnded}
        services={services}
      />
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
