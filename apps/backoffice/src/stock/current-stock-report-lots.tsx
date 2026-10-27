import type { CurrentStockReportBody } from "@purosur/contracts";
import {
  dataColumn,
  Eyebrow,
  formatCalendarDayNumeric,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { formatStockQuantity } from "../platform/stock-quantity";
import { formatStockUnitCost, formatStockValue } from "./stock-cost";

type Product = CurrentStockReportBody["products"][number];
type Lot = Product["lots"][number];

function amountTone(amount: number | null, otherwise: "subtle" | undefined) {
  if (amount === null) {
    return "subtle";
  }
  return amount < 0 ? "error" : otherwise;
}

export function CurrentStockReportLots({ product }: { product: Product }) {
  const columns = [
    dataColumn({
      id: "lot",
      width: 160,
      header: "Lote",
      render: (lot: Lot) =>
        lot.technical ? (
          <TableCellText strong>Técnico</TableCellText>
        ) : (
          <TableCellText strong monospace>
            {lot.lot_number ?? "—"}
          </TableCellText>
        ),
    }),
    dataColumn({
      id: "expiresOn",
      width: 150,
      header: "Vencimiento",
      render: (lot: Lot) =>
        lot.expires_on === null ? (
          <TableCellText tone="subtle">—</TableCellText>
        ) : (
          <TableCellText>{formatCalendarDayNumeric(lot.expires_on)}</TableCellText>
        ),
    }),
    dataColumn({
      id: "remaining",
      width: 150,
      header: "Saldo",
      align: "end",
      render: (lot: Lot) => (
        <TableCellText strong tone={amountTone(lot.remaining, undefined)}>
          {formatStockQuantity(lot.remaining, product.sale_unit)}
        </TableCellText>
      ),
    }),
    dataColumn({
      id: "unitCost",
      width: 160,
      header: "Costo unitario",
      align: "end",
      render: (lot: Lot) => (
        <TableCellText tone={amountTone(lot.unit_cost_cents, "subtle")}>
          {formatStockUnitCost(lot.unit_cost_cents, product.sale_unit)}
        </TableCellText>
      ),
    }),
    dataColumn({
      id: "value",
      width: 170,
      header: "Valorizado",
      align: "end",
      render: (lot: Lot) => (
        <TableCellText strong tone={amountTone(lot.value_cents, undefined)}>
          {formatStockValue(lot.value_cents)}
        </TableCellText>
      ),
    }),
  ] as const;

  const table = useTableModel({ items: product.lots, id: (lot) => lot.id, columns });

  return (
    <div className="flex flex-col gap-2">
      <Eyebrow text="Lotes" />
      <Table table={table} aria-label={`Lotes de ${product.name}`} variant="nested" />
    </div>
  );
}
