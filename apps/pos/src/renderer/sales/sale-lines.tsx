import type { OpenSale } from "@purosur/contracts";
import type { KeyLegendItem } from "@purosur/ui";
import {
  actionsColumn,
  dataColumn,
  formatCents,
  formatNumber,
  formatWeight,
  Table,
  Tag,
  useTableModel,
} from "@purosur/ui";
import {
  Package,
  Percent,
  Scale,
  ShoppingBasket,
  TagIcon,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { lineAdjustmentText } from "./line-adjustment-text";
import { linePromotionText } from "./line-promotion-text";

type SaleLine = OpenSale["lines"][number];

export type SaleLineActions = {
  busy: boolean;
  editable: boolean;
  onChangeWeight: (line: SaleLine) => void;
  onAdjust: (line: SaleLine) => void;
  onRemove: (line: SaleLine) => void;
};

function lineMark(line: SaleLine): string | undefined {
  if (line.manual_adjustment !== null) {
    return lineAdjustmentText(line.manual_adjustment);
  }
  return line.promotion === null ? undefined : linePromotionText(line.promotion);
}

function ProductCell({ line }: { line: SaleLine }) {
  const mark = lineMark(line);
  const TypeIcon = line.sale_unit === "KG" ? Scale : Package;
  return (
    <span className="flex items-center gap-4">
      <span
        aria-hidden="true"
        className="flex size-control-sm shrink-0 items-center justify-center rounded-full bg-surface-soft text-text-eyebrow"
      >
        <TypeIcon className="size-icon-md" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-subheading font-semibold text-text">
          {line.product_name}
        </span>
        {mark === undefined ? null : (
          <span>
            <Tag tone="success" icon={<TagIcon />}>
              {mark}
            </Tag>
          </span>
        )}
      </span>
    </span>
  );
}

function AmountCell({ line }: { line: SaleLine }) {
  return (
    <span className="flex flex-col items-end">
      {line.discount_amount === 0 ? null : (
        <s className="text-detail text-text-subtle">
          {formatCents(line.line_total + line.discount_amount)}
        </s>
      )}
      <span className="text-heading text-text">{formatCents(line.line_total)}</span>
    </span>
  );
}

const dataColumns = [
  dataColumn({
    id: "product",
    header: "Producto",
    render: (line: SaleLine) => <ProductCell line={line} />,
  }),
  dataColumn({
    id: "price",
    header: "Precio",
    width: 170,
    render: (line: SaleLine) =>
      `${formatCents(line.list_unit_price)} / ${line.sale_unit === "KG" ? "kg" : "u"}`,
  }),
  dataColumn({
    id: "quantity",
    header: "Cantidad",
    width: 110,
    render: (line: SaleLine) =>
      line.sale_unit === "KG" ? formatWeight(line.quantity) : `${formatNumber(line.quantity)} u`,
  }),
  dataColumn({
    id: "amount",
    header: "Importe",
    align: "end",
    width: 150,
    render: (line: SaleLine) => <AmountCell line={line} />,
  }),
] as const;

export function SaleLines({
  lines,
  selectedLineId,
  legend,
  failed,
  actions,
  onSelect,
}: {
  lines: OpenSale["lines"];
  selectedLineId: string | undefined;
  legend: readonly KeyLegendItem[];
  failed: boolean;
  actions: SaleLineActions;
  onSelect: (line: SaleLine) => void;
}) {
  const latest = useRef(actions);
  useEffect(() => {
    latest.current = actions;
  });
  const { busy, editable } = actions;
  const columns = [
    ...dataColumns,
    actionsColumn({
      id: "actions",
      header: "Acciones",
      actions: [
        (line: SaleLine) =>
          editable && line.sale_unit === "KG"
            ? {
                icon: <Scale />,
                "aria-label": `Cambiar el peso de ${line.product_name}`,
                disabled: busy,
                onPress: () => latest.current.onChangeWeight(line),
              }
            : undefined,
        (line: SaleLine) =>
          editable
            ? {
                icon: <Percent />,
                "aria-label": `Cambiar el precio de ${line.product_name}`,
                disabled: busy,
                onPress: () => latest.current.onAdjust(line),
              }
            : undefined,
        (line: SaleLine) =>
          editable
            ? {
                icon: <Trash2 />,
                "aria-label": `Quitar ${line.product_name}`,
                disabled: busy,
                onPress: () => latest.current.onRemove(line),
              }
            : undefined,
      ],
    }),
  ] as const;
  const table = useTableModel({ items: lines, id: (line) => line.id, columns });
  return (
    <Table
      table={table}
      aria-label="Líneas de la venta"
      fill
      legend={legend}
      rowState={(line) => (line.id === selectedLineId ? "selected" : undefined)}
      onRowPress={onSelect}
      empty={{ variant: "blank", icon: <ShoppingBasket />, title: "La venta está vacía" }}
      {...(failed
        ? {
            failure: {
              variant: "centered",
              icon: <TriangleAlert />,
              title: "No se pudo cargar la venta",
              description: "Volvé a intentarlo en unos segundos.",
            },
          }
        : {})}
    />
  );
}

export function LockedSaleLines({ lines, label }: { lines: OpenSale["lines"]; label: string }) {
  const table = useTableModel({ items: lines, id: (line) => line.id, columns: dataColumns });
  return <Table table={table} aria-label="Líneas de la venta" fill locked={{ label }} />;
}
