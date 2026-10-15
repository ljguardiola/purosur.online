import type { SummaryRowProps } from "@purosur/ui";
import {
  Button,
  EmptyState,
  Eyebrow,
  FigureStat,
  formatCents,
  formatClockTime,
  formatOperationNumber,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  plural,
  SidePanel,
  SummaryRowGroup,
} from "@purosur/ui";
import { CircleX, FileSearch, Lock, Printer, ReceiptText, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { CoreData } from "../platform/use-core-query";
import type { SaleDetail } from "../shell/sale-receipt-text";
import {
  comprobantePresentation,
  nonEmptyRows,
  receiptCopyPresentation,
} from "../shell/sale-receipt-text";
import { paymentMethodName } from "./sale-history-text";
import type { ShownSaleHistoryDetail } from "./sales-queries";
import { useSaleHistoryDetailQuery } from "./sales-queries";
import { voidRefusalNotice } from "./void-sale-text";

function detailRows(sale: SaleDetail): SummaryRowProps[] {
  const comprobante = comprobantePresentation(sale.comprobante);
  return [
    ...(comprobante === undefined
      ? []
      : [
          { label: "Comprobante", value: comprobante.name },
          {
            label: sale.comprobante.kind === "fiscal" ? "Número" : "Situación",
            value: comprobante.detail,
          },
        ]),
    ...(sale.state === "voided" ? [{ label: "Estado", value: "Anulada" }] : []),
    ...(sale.operation_number === null
      ? []
      : [{ label: "Operación", value: formatOperationNumber(sale.operation_number) }]),
    { label: "Atendió", value: sale.served_by_first_name },
    {
      label: "Productos",
      value: `${sale.line_count} ${plural(sale.line_count, { one: "línea", other: "líneas" })}`,
    },
  ];
}

type SaleActions = {
  onReprint: (sale: SaleDetail) => void;
  onVoid: (sale: SaleDetail) => void;
};

function SaleFooter({ sale, onReprint, onVoid }: { sale: SaleDetail } & SaleActions) {
  const { voidability } = sale;
  const notice =
    voidability.kind === "voidable" ? undefined : voidRefusalNotice(voidability.refusal);
  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="secondary"
        size="large"
        fullWidth
        icon={<Printer />}
        onPress={() => onReprint(sale)}
      >
        {receiptCopyPresentation(sale.next_copy).printButton}
      </Button>
      <Button
        variant="secondary"
        size="large"
        fullWidth
        icon={<CircleX />}
        disabled={voidability.kind !== "voidable"}
        onPress={() => onVoid(sale)}
      >
        Anular venta
      </Button>
      {sale.void_authorization_required ? (
        <p className="text-detail text-text-subtle">
          Sin permiso para anular, se pide el PIN de alguien que lo tenga.
        </p>
      ) : null}
      {notice === undefined ? null : (
        <InlineNotice
          tone="warning"
          icon={<TriangleAlert />}
          title={notice.title}
          description={notice.description}
        />
      )}
    </div>
  );
}

function Sale({ sale, onReprint, onVoid }: { sale: SaleDetail } & SaleActions) {
  const details = nonEmptyRows(detailRows(sale));
  const payments = nonEmptyRows(
    sale.payments.map((payment) => ({
      label: paymentMethodName(payment.method),
      value: formatCents(payment.amount),
    })),
  );
  return (
    <SidePanel
      label="Detalle de la venta"
      footer={
        sale.state === "voided" ? undefined : (
          <SaleFooter sale={sale} onReprint={onReprint} onVoid={onVoid} />
        )
      }
    >
      <FigureStat
        label={`VENTA DE LAS ${formatClockTime(sale.occurred_at)}`}
        value={formatCents(sale.total)}
      />
      {details === undefined ? null : <SummaryRowGroup rows={details} />}
      {payments === undefined ? null : (
        <div className="flex flex-col gap-2">
          <Eyebrow text="PAGOS" />
          <SummaryRowGroup rows={payments} />
        </div>
      )}
    </SidePanel>
  );
}

function Message({ children }: { children: ReactNode }) {
  return <SidePanel label="Detalle de la venta">{children}</SidePanel>;
}

function SelectedSale({
  detail,
  onReprint,
  onVoid,
}: {
  detail: CoreData<ShownSaleHistoryDetail>;
} & SaleActions) {
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
      <Message>
        <LoadFailure
          icon={<TriangleAlert />}
          title="No se pudo leer la venta"
          description="Volvé a intentarlo en unos segundos."
          onRetry={detail.retry}
        />
      </Message>
    );
  }
  switch (detail.value.kind) {
    case "found":
      return <Sale sale={detail.value.detail} onReprint={onReprint} onVoid={onVoid} />;
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

function SelectedSaleReader({
  saleId,
  readDetail,
  onReprint,
  onVoid,
}: {
  saleId: string;
  readDetail: SaleHistoryDetailPanelProps["readDetail"];
} & SaleActions) {
  const detail = useSaleHistoryDetailQuery({ saleId, read: readDetail });
  return <SelectedSale detail={detail} onReprint={onReprint} onVoid={onVoid} />;
}

export type SaleHistoryDetailPanelProps = {
  saleId: string | undefined;
  readDetail: Parameters<typeof useSaleHistoryDetailQuery>[0]["read"];
} & SaleActions;

export function SaleHistoryDetailPanel({
  saleId,
  readDetail,
  onReprint,
  onVoid,
}: SaleHistoryDetailPanelProps) {
  if (saleId === undefined) {
    return (
      <Message>
        <EmptyState
          variant="blank"
          icon={<ReceiptText />}
          title="Elegí una venta para ver su detalle"
        />
      </Message>
    );
  }
  return (
    <SelectedSaleReader
      saleId={saleId}
      readDetail={readDetail}
      onReprint={onReprint}
      onVoid={onVoid}
    />
  );
}
