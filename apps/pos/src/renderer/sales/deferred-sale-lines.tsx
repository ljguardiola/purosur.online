import {
  dataColumn,
  formatCents,
  formatNumber,
  formatWeight,
  Table,
  useTableModel,
} from "@purosur/ui";
import { Package, Scale, ScanBarcode } from "lucide-react";
import type { FoundDeferredSale } from "./deferred-sale-text";

type Line = FoundDeferredSale["lines"][number] & { id: string };

const columns = [
  dataColumn({
    id: "product",
    header: "Producto",
    render: (line: Line) => {
      const TypeIcon = line.sale_unit === "KG" ? Scale : Package;
      return (
        <span className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="flex size-control-sm shrink-0 items-center justify-center rounded-full bg-surface-soft text-text-eyebrow"
          >
            <TypeIcon className="size-icon-md" />
          </span>
          <span className="truncate text-subheading font-semibold text-text">
            {line.product_name}
          </span>
        </span>
      );
    },
  }),
  dataColumn({
    id: "price",
    header: "Precio",
    width: 170,
    render: (line: Line) =>
      `${formatCents(line.list_unit_price)} / ${line.sale_unit === "KG" ? "kg" : "u"}`,
  }),
  dataColumn({
    id: "quantity",
    header: "Cantidad",
    width: 110,
    render: (line: Line) => (
      <span className="text-subheading font-semibold text-text">
        {line.sale_unit === "KG" ? formatWeight(line.quantity) : `${formatNumber(line.quantity)} u`}
      </span>
    ),
  }),
  dataColumn({
    id: "amount",
    header: "Importe",
    align: "end",
    width: 150,
    render: (line: Line) => (
      <span className="text-heading text-text">{formatCents(line.line_total)}</span>
    ),
  }),
] as const;

export function DeferredSaleLines({
  lines,
  loading,
}: {
  lines: FoundDeferredSale["lines"];
  loading: boolean;
}) {
  const table = useTableModel({
    items: lines.map((line, position) => ({ ...line, id: `${position}` })),
    id: (line) => line.id,
    columns,
  });
  return (
    <Table
      table={table}
      aria-label="Líneas de la venta"
      fill
      loading={loading ? "initial" : false}
      locked={{ label: "Líneas bloqueadas" }}
      empty={{
        variant: "blank",
        icon: <ScanBarcode />,
        title: "Acercá el QR del documento al lector",
        description: "Sirve el QR del documento no fiscal de una venta diferida.",
      }}
    />
  );
}
