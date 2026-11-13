import type { EmptyStateProps } from "@purosur/ui";
import {
  Checkbox,
  dataColumn,
  formatCents,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { Receipt } from "lucide-react";
import type { ReactNode } from "react";
import type { LegendItem } from "../platform/key-layer";
import type { SaleLineForReturn } from "./return-sale";
import { quantityText } from "./return-text";

export type ReturnLineRow = {
  line: SaleLineForReturn;
  marked: boolean;
  quantity: number | undefined;
  refund: number | null | undefined;
  refused: boolean;
};

export type ReturnLinesTableProps = {
  rows: readonly ReturnLineRow[];
  selectedLineId: string | undefined;
  legend: readonly LegendItem[];
  footer?: ReactNode;
  onSelect: (lineId: string) => void;
  onMark: (lineId: string, marked: boolean) => void;
};

const MARK_WIDTH = 56;
const SOLD_WIDTH = 130;
const RETURNING_WIDTH = 130;
const REFUND_WIDTH = 160;

const NO_SALE: EmptyStateProps = { variant: "blank", icon: <Receipt />, title: "Sin ventas" };

const NOT_SHOWN = "—";

export function ReturnLinesTable({
  rows,
  selectedLineId,
  legend,
  footer,
  onSelect,
  onMark,
}: ReturnLinesTableProps) {
  const columns = [
    dataColumn({
      id: "mark",
      header: "Marcar",
      width: MARK_WIDTH,
      render: ({ line, marked }: ReturnLineRow) => (
        <Checkbox
          name={`return-${line.id}`}
          checked={marked}
          disabled={line.returnable_quantity === 0}
          onCheckedChange={(checked) => onMark(line.id, checked)}
        >
          <span className="sr-only">{line.product_name}</span>
        </Checkbox>
      ),
    }),
    dataColumn({
      id: "product",
      header: "Producto",
      render: ({ line }: ReturnLineRow) => (
        <TableCellText
          strong
          {...(line.returnable_quantity === 0 ? { description: "Ya se devolvió completa" } : {})}
        >
          {line.product_name}
        </TableCellText>
      ),
    }),
    dataColumn({
      id: "sold",
      header: "Vendido",
      width: SOLD_WIDTH,
      render: ({ line }: ReturnLineRow) => (
        <TableCellText>{quantityText(line.sale_unit, line.sold_quantity)}</TableCellText>
      ),
    }),
    dataColumn({
      id: "returning",
      header: "A devolver",
      width: RETURNING_WIDTH,
      render: ({ line, marked, quantity, refused }: ReturnLineRow) => {
        const shown =
          marked && quantity !== undefined ? quantityText(line.sale_unit, quantity) : NOT_SHOWN;
        return (
          <TableCellText strong {...(refused ? { tone: "error" as const } : {})}>
            {shown}
          </TableCellText>
        );
      },
    }),
    dataColumn({
      id: "refund",
      header: "Reintegro",
      align: "end",
      width: REFUND_WIDTH,
      render: ({ marked, refund }: ReturnLineRow) => {
        const shown =
          marked && refund !== null && refund !== undefined ? formatCents(refund) : NOT_SHOWN;
        return <TableCellText strong>{shown}</TableCellText>;
      },
    }),
  ] as const;
  const table = useTableModel({ items: rows, id: ({ line }) => line.id, columns });

  return (
    <Table
      aria-label="Líneas de la venta"
      table={table}
      fill
      emptyKeepsHeaders
      legend={legend}
      empty={NO_SALE}
      {...(footer === undefined ? {} : { footer })}
      rowState={({ line }) => (line.id === selectedLineId ? "selected" : undefined)}
      onRowPress={({ line }) => onSelect(line.id)}
    />
  );
}
