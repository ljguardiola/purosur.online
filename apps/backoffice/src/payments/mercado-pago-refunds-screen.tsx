import type { ConfirmedRefundBody } from "@purosur/contracts";
import {
  actionsColumn,
  dataColumn,
  FloatingNotification,
  formatCents,
  ListFilter,
  type NoticeTone,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { Check, CircleX, HandCoins, Send, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { paymentMethodLabel } from "../platform/payment-method-label";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import { DiscardRefundModal } from "./discard-refund-modal";
import { usePendingRefundsQuery, useRefreshPayments } from "./payments-queries";
import {
  amountColumn,
  type PendingRefund,
  pendingSinceColumn,
  reasonColumn,
} from "./refund-columns";
import { refundConfirmationNotice } from "./refund-confirmation-notice";
import { refundDeliveryStatus } from "./refund-delivery-status";
import { sentToMercadoPago } from "./refund-kinds";
import { registerFilterOptions, useOfferedChoice, useReportedFilters } from "./refunds-filters";
import type { RefundsScreenServices } from "./refunds-services";
import { ALL_REGISTERS, type MercadoPagoRefundsFilters } from "./routes";
import { SendRefundModal } from "./send-refund-modal";

export type MercadoPagoRefundsScreenProps = {
  filters: MercadoPagoRefundsFilters;
  onFiltersChange: (filters: MercadoPagoRefundsFilters) => void;
  onSessionEnded: () => void;
  services: RefundsScreenServices;
};

type ScreenNotice = {
  id: number;
  tone: NoticeTone;
  title: string;
  description: string;
};

const NO_REFUNDS: PendingRefund[] = [];

const methodColumn = dataColumn({
  id: "method",
  header: "Medio",
  render: (refund: PendingRefund) => {
    const status = refundDeliveryStatus(refund);
    const order = refund.provider_order_id === null ? null : `Orden ${refund.provider_order_id}`;
    const description = [status, order].filter((part) => part !== null).join(" · ") || null;
    return description === null ? (
      paymentMethodLabel(refund.method)
    ) : (
      <TableCellText description={description}>{paymentMethodLabel(refund.method)}</TableCellText>
    );
  },
});

export function MercadoPagoRefundsScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: MercadoPagoRefundsScreenProps) {
  const data = usePendingRefundsQuery({
    fetchPendingRefunds: services.fetchPendingRefunds,
    onSessionEnded,
  });
  const refreshPayments = useRefreshPayments();
  const [discardTarget, setDiscardTarget] = useState<PendingRefund | null>(null);
  const [sendTarget, setSendTarget] = useState<PendingRefund | null>(null);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const lastNoticeId = useRef(0);
  const refunds = data.status === "loaded" ? sentToMercadoPago(data.value.refunds) : NO_REFUNDS;

  const registerOptions = registerFilterOptions(refunds);
  const register = useOfferedChoice({
    chosen: filters.register,
    options: registerOptions,
    settled: data.status === "loaded",
  });
  useReportedFilters({ register: register.choice }, filters, onFiltersChange);

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
          refund.delivery_stage === "unconfirmed"
            ? {
                icon: <Send />,
                "aria-label": `Enviar a Mercado Pago el reembolso de ${formatCents(refund.amount)}`,
                onPress: () => setSendTarget(refund),
              }
            : undefined,
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
    filter: (refund) => register.shown === ALL_REGISTERS || refund.register_id === register.shown,
  });

  return (
    <>
      <ScreenLayout
        topBar={
          <ScreenTopBar eyebrow="Caja y fiscal · Tareas" title="Reembolsos de Mercado Pago" />
        }
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
        </div>
        <Table
          aria-label="Reembolsos de Mercado Pago"
          table={table}
          {...cloudTableState(data, "los reembolsos de Mercado Pago")}
          empty={{
            icon: <HandCoins />,
            title: "Sin reembolsos de Mercado Pago pendientes",
            description: "Nada espera para enviarse a Mercado Pago.",
            variant: "blank",
          }}
          footer={
            <p className="text-text-subtle text-detail">
              Los reembolsos con QR o Point de ventas canceladas, y con QR de aprobaciones tardías,
              se envían a Mercado Pago recién cuando se confirman acá. Los de ventas anuladas con QR
              o Point los confirmó en la caja quien anuló la venta, y se envían sin pasar por acá.
            </p>
          }
        />
      </ScreenLayout>
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
