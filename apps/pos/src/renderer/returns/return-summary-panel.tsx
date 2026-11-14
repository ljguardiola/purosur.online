import type { SummaryRowProps } from "@purosur/ui";
import {
  Button,
  CheckboxKeyCard,
  formatCents,
  formatDayMonthAndTimeInColumn,
  formatInvoiceNumber,
  formatPointOfSaleNumber,
  InlineNotice,
  LoadFailure,
  SidePanel,
  SummaryRowGroup,
} from "@purosur/ui";
import { Check, ShieldCheck, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { ReturnPanelFigure } from "./return-panel-figure";
import type { SaleForReturn } from "./return-sale";

export type ReturnSummaryPanelProps = {
  sale: SaleForReturn;
  total: number | undefined;
  totalFailed: { retry: () => void } | undefined;
  linesCount: number;
  paymentRows: readonly SummaryRowProps[];
  notice: string | undefined;
  authorizedBy: string | undefined;
  verification: { checked: boolean; onChange: (checked: boolean) => void } | undefined;
  canComplete: boolean;
  submitting: boolean;
  onComplete: () => void;
  children?: ReactNode;
};

export function ReturnSummaryPanel({
  sale,
  total,
  totalFailed,
  linesCount,
  paymentRows,
  notice,
  authorizedBy,
  verification,
  canComplete,
  submitting,
  onComplete,
  children,
}: ReturnSummaryPanelProps) {
  const saleRow: SummaryRowProps = {
    label: "Venta",
    value: formatDayMonthAndTimeInColumn(sale.occurred_at),
  };
  const invoiceRow: SummaryRowProps | undefined =
    sale.invoice === null
      ? undefined
      : {
          label: "Factura C",
          value: `${formatPointOfSaleNumber(sale.invoice.point_of_sale)}-${formatInvoiceNumber(sale.invoice.number)}`,
        };
  const linesRow: SummaryRowProps = { label: "Líneas a devolver", value: String(linesCount) };

  return (
    <SidePanel
      label="Resumen de la devolución"
      width="wide"
      header={
        <ReturnPanelFigure
          label="A REINTEGRAR"
          value={total === undefined ? undefined : formatCents(total)}
        />
      }
      footer={
        <>
          {verification === undefined ? null : (
            <CheckboxKeyCard
              name="ticket-verified"
              label="Ticket verificado"
              keyName="T"
              checked={verification.checked}
              disabled={submitting}
              onCheckedChange={verification.onChange}
            />
          )}
          <Button
            size="large"
            fullWidth
            icon={<Check />}
            iconPosition="start"
            keycap="Enter"
            disabled={!canComplete}
            dataStatus={submitting ? "loading" : "loaded"}
            onPress={onComplete}
          >
            Completar devolución
          </Button>
        </>
      }
    >
      {totalFailed === undefined ? null : (
        <LoadFailure
          icon={<TriangleAlert />}
          title="No se pudo calcular el reintegro"
          description="Probá de nuevo."
          onRetry={totalFailed.retry}
        />
      )}
      <SummaryRowGroup
        variant="divided"
        rows={[
          invoiceRow ?? saleRow,
          ...(invoiceRow === undefined ? [] : [saleRow]),
          linesRow,
          ...paymentRows,
        ]}
      />
      {authorizedBy === undefined ? null : (
        <InlineNotice tone="info" icon={<ShieldCheck />} title={`Autorizó ${authorizedBy}`} />
      )}
      {notice === undefined ? null : (
        <InlineNotice tone="warning" icon={<TriangleAlert />} title={notice} />
      )}
      {children}
    </SidePanel>
  );
}
