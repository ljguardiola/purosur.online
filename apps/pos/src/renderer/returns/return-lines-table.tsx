import type { PreviewReturnOutcome } from "@purosur/contracts";
import type { EmptyStateProps, LoadFailureProps } from "@purosur/ui";
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
import type { ReturnDraft } from "./return-form";
import { draftLinesFor } from "./return-form";
import type { SaleForReturn, SaleLineForReturn } from "./return-sale";
import { quantityText } from "./return-text";

type PreviewedReturn = Extract<PreviewReturnOutcome, { kind: "previewed" }>;

type ReturnLineRow = {
  line: SaleLineForReturn;
  marked: boolean;
  quantity: number | undefined;
  refund: number | null | undefined;
  refused: boolean;
};

export type ReturnLinesTableProps = {
  sale: SaleForReturn | undefined;
  draft: ReturnDraft;
  previewed: PreviewedReturn | undefined;
  selectedLineId: string | undefined;
  legend: readonly LegendItem[];
  loading?: boolean;
  failure?: LoadFailureProps | undefined;
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
  sale,
  draft,
  previewed,
  selectedLineId,
  legend,
  loading = false,
  failure,
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
  const drafted = sale === undefined ? [] : draftLinesFor(sale, draft);
  const rows: ReturnLineRow[] = (sale?.lines ?? []).map((line) => {
    const quantity = drafted.find(({ sale_line_id: id }) => id === line.id)?.quantity;
    const previewedLine = previewed?.lines.find(({ sale_line_id: id }) => id === line.id);
    return {
      line,
      marked: quantity !== undefined,
      quantity,
      refund: previewedLine?.refund_amount,
      refused: previewedLine?.refusal != null,
    };
  });
  const table = useTableModel({ items: rows, id: ({ line }) => line.id, columns });

  return (
    <Table
      aria-label="Líneas de la venta"
      table={table}
      fill
      emptyKeepsHeaders
      failureKeepsHeaders
      legend={legend}
      empty={NO_SALE}
      {...(failure === undefined
        ? { loading: loading ? ("initial" as const) : false }
        : { failure })}
      {...(footer === undefined ? {} : { footer })}
      rowState={({ line }) => (line.id === selectedLineId ? "selected" : undefined)}
      onRowPress={({ line }) => onSelect(line.id)}
    />
  );
}
