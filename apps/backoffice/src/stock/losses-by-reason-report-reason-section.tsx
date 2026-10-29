import type { LossesByReasonReportBody } from "@purosur/contracts";
import { dataColumn, formatNumber, Table, TableCellText, useTableModel } from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { useId } from "react";
import { formatStockQuantity } from "../platform/stock-quantity";
import { lossCountText } from "./loss-count-text";
import { REASON_LABELS } from "./stock-reason-labels";

type ReasonLosses = LossesByReasonReportBody["reasons"][number];
type LostProduct = ReasonLosses["products"][number];

const columns = [
  dataColumn({
    id: "product",
    header: "Producto",
    render: (product: LostProduct) => (
      <TableCellText>
        {formatProductDescription({
          name: product.name,
          brandName: product.brand_name,
          netContent: product.net_content,
        })}
      </TableCellText>
    ),
  }),
  dataColumn({
    id: "quantity",
    width: 180,
    header: "Cantidad",
    align: "end",
    render: (product: LostProduct) => (
      <TableCellText strong>
        {formatStockQuantity(product.quantity, product.sale_unit)}
      </TableCellText>
    ),
  }),
  dataColumn({
    id: "losses",
    width: 120,
    header: "Pérdidas",
    align: "end",
    render: (product: LostProduct) => (
      <TableCellText>{formatNumber(product.loss_count)}</TableCellText>
    ),
  }),
] as const;

export function LossesByReasonReportReasonSection({
  losses,
  refreshing,
}: {
  losses: ReasonLosses;
  refreshing: boolean;
}) {
  const headingId = useId();
  const label = REASON_LABELS[losses.reason];
  const table = useTableModel({
    items: losses.products,
    id: (product) => product.id,
    columns,
  });
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-subheading text-text">
          {label}
        </h2>
        <p className="text-detail text-text-subtle">{lossCountText(losses.loss_count)}</p>
      </div>
      <Table
        aria-label={`Productos perdidos por ${label}`}
        table={table}
        loading={refreshing ? "updating" : false}
      />
    </section>
  );
}
