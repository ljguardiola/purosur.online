import type { SummaryRowProps } from "@purosur/ui";
import {
  Button,
  EmptyState,
  Eyebrow,
  FigureStat,
  formatCents,
  formatClockTime,
  formatOperationNumber,
  LoadFailure,
  LoadingPlaceholder,
  plural,
  SidePanel,
  SummaryRowGroup,
} from "@purosur/ui";
import { FileSearch, Lock, Printer, ReceiptText, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { CoreData } from "../platform/use-core-query";
import type { SaleDetail } from "./sale-history-text";
import {
  comprobantePresentation,
  nonEmptyRows,
  paymentMethodName,
  receiptCopyPresentation,
} from "./sale-history-text";
import type { ShownSaleHistoryDetail } from "./sales-queries";
import { useSaleHistoryDetailQuery } from "./sales-queries";

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

function Sale({ sale, onReprint }: { sale: SaleDetail; onReprint: (sale: SaleDetail) => void }) {
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
        <Button
          variant="secondary"
          size="large"
          fullWidth
          icon={<Printer />}
          onPress={() => onReprint(sale)}
        >
          {receiptCopyPresentation(sale.next_copy).printButton}
        </Button>
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
}: {
  detail: CoreData<ShownSaleHistoryDetail>;
  onReprint: (sale: SaleDetail) => void;
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
      return <Sale sale={detail.value.detail} onReprint={onReprint} />;
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
}: {
  saleId: string;
  readDetail: SaleHistoryDetailPanelProps["readDetail"];
  onReprint: (sale: SaleDetail) => void;
}) {
  const detail = useSaleHistoryDetailQuery({ saleId, read: readDetail });
  return <SelectedSale detail={detail} onReprint={onReprint} />;
}

export type SaleHistoryDetailPanelProps = {
  saleId: string | undefined;
  readDetail: Parameters<typeof useSaleHistoryDetailQuery>[0]["read"];
  onReprint: (sale: SaleDetail) => void;
};

export function SaleHistoryDetailPanel({
  saleId,
  readDetail,
  onReprint,
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
  return <SelectedSaleReader saleId={saleId} readDetail={readDetail} onReprint={onReprint} />;
}
