import type { KeyName, SummaryRowProps } from "@purosur/ui";
import {
  Button,
  EmptyState,
  Eyebrow,
  FigureStat,
  formatCents,
  formatClockTime,
  formatDayMonthAndTime,
  formatNumber,
  formatOperationNumber,
  formatShortCode,
  formatWeight,
  Keycap,
  LineItemList,
  LoadFailure,
  LoadingPlaceholder,
  SidePanel,
  SummaryRowGroup,
} from "@purosur/ui";
import { FileSearch, Lock, Printer, ReceiptText, RefreshCw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { CoreData } from "../platform/use-core-query";
import type { SaleDetail } from "../shell/sale-receipt-text";
import { nonEmptyRows } from "../shell/sale-receipt-text";
import { creditNoteRowOf } from "./credit-note-text";
import { comprobanteRow, paymentRowName } from "./sale-history-text";
import type { ShownSaleHistoryDetail } from "./sales-queries";

export type SaleButton = {
  key?: KeyName;
  label: string;
  primary: boolean;
  onPress: () => void;
};

export type SaleHistoryDetailPanelProps = {
  detail: CoreData<ShownSaleHistoryDetail> | undefined;
  withDate: boolean;
  buttons: readonly SaleButton[];
  escape: boolean;
};

function detailRows(sale: SaleDetail): SummaryRowProps[] {
  const comprobante = comprobanteRow(sale.comprobante);
  return [
    ...(comprobante === undefined ? [] : [comprobante]),
    ...sale.credit_notes.map(creditNoteRowOf),
    ...sale.payments.map((payment) => ({
      label: paymentRowName(payment.method, payment.card_type),
      value: formatCents(payment.amount),
    })),
    ...(sale.cash_rounding > 0
      ? [{ label: "Redondeo", value: `– ${formatCents(sale.cash_rounding)}` }]
      : []),
    ...(sale.short_code === null
      ? []
      : [{ label: "Código de consulta", value: formatShortCode(sale.short_code) }]),
    ...(sale.operation_number === null
      ? []
      : [{ label: "Operación", value: formatOperationNumber(sale.operation_number) }]),
    { label: "Atendió", value: sale.served_by_first_name },
  ];
}

function Buttons({ buttons }: { buttons: readonly SaleButton[] }) {
  if (buttons.length === 0) {
    return null;
  }
  return buttons.map(({ key, label, primary, onPress }) => (
    <Button
      key={label}
      variant={primary ? "primary" : "secondary"}
      size="large"
      fullWidth
      icon={<Printer />}
      {...(primary ? { iconPosition: "start" as const } : {})}
      {...(key === undefined ? {} : { keycap: key })}
      onPress={onPress}
    >
      {label}
    </Button>
  ));
}

function Header({ escape }: { escape: boolean }) {
  return (
    <div className="flex items-center justify-between px-8 pt-8">
      <Eyebrow text="DETALLE DE LA VENTA" />
      {escape ? <Keycap keyName="Escape" /> : null}
    </div>
  );
}

function Message({
  children,
  escape = false,
  footer,
}: {
  children: ReactNode;
  escape?: boolean;
  footer?: ReactNode;
}) {
  return (
    <SidePanel label="Detalle de la venta" header={<Header escape={escape} />} footer={footer}>
      {children}
    </SidePanel>
  );
}

function Sale({
  sale,
  withDate,
  buttons,
}: {
  sale: SaleDetail;
  withDate: boolean;
  buttons: readonly SaleButton[];
}) {
  const rows = nonEmptyRows(detailRows(sale));
  const when = withDate
    ? formatDayMonthAndTime(sale.occurred_at)
    : formatClockTime(sale.occurred_at);
  return (
    <SidePanel
      label="Detalle de la venta"
      footer={buttons.length === 0 ? undefined : <Buttons buttons={buttons} />}
    >
      <FigureStat
        size="hero"
        variant="plain"
        label={`VENTA · ${when}`}
        value={formatCents(sale.total)}
      />
      {rows === undefined ? null : <SummaryRowGroup rows={rows} />}
      {sale.lines.length === 0 ? null : (
        <div className="flex flex-col gap-2">
          <Eyebrow text="PRODUCTOS" />
          <LineItemList
            label="Productos"
            items={sale.lines.map((line, position) => ({
              id: `${position}`,
              name: line.product_name,
              quantity:
                line.sale_unit === "KG"
                  ? formatWeight(line.quantity)
                  : `${formatNumber(line.quantity)} u`,
              amount: formatCents(line.line_total),
            }))}
          />
        </div>
      )}
    </SidePanel>
  );
}

function Selected({
  detail,
  withDate,
  buttons,
}: {
  detail: CoreData<ShownSaleHistoryDetail>;
  withDate: boolean;
  buttons: readonly SaleButton[];
}) {
  if (detail.status === "loading") {
    return (
      <Message>
        <FigureStat label="VENTA" loading />
        <LoadingPlaceholder variant="card" lines={5} />
      </Message>
    );
  }
  if (detail.status === "failed") {
    return (
      <Message
        footer={
          <Button
            size="large"
            fullWidth
            icon={<RefreshCw />}
            iconPosition="start"
            keycap="R"
            onPress={detail.retry}
          >
            Reintentar
          </Button>
        }
      >
        <LoadFailure
          variant="centered"
          icon={<TriangleAlert />}
          title="No se pudo leer la venta"
          description="Volvé a intentarlo en unos segundos."
        />
      </Message>
    );
  }
  switch (detail.value.kind) {
    case "found":
      return <Sale sale={detail.value.detail} withDate={withDate} buttons={buttons} />;
    case "not_found":
      return (
        <Message>
          <EmptyState
            variant="blank"
            icon={<FileSearch />}
            title="La venta ya no está en el historial"
          />
        </Message>
      );
    case "not_signed_in":
      return (
        <Message>
          <EmptyState
            variant="blank"
            icon={<TriangleAlert />}
            title="La sesión terminó. Volvé a ingresar para ver la venta"
          />
        </Message>
      );
    case "lacks_permission":
      return (
        <Message>
          <EmptyState
            variant="blank"
            icon={<Lock />}
            title="No tenés permiso para ver esta venta"
          />
        </Message>
      );
  }
}

export function SaleHistoryDetailPanel({
  detail,
  withDate,
  buttons,
  escape,
}: SaleHistoryDetailPanelProps) {
  if (detail === undefined) {
    return (
      <Message escape={escape}>
        <EmptyState
          variant="blank"
          icon={<ReceiptText />}
          title="Elegí una venta para ver su detalle"
        />
      </Message>
    );
  }
  return <Selected detail={detail} withDate={withDate} buttons={buttons} />;
}
