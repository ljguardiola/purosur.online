import type { StockBalance } from "@purosur/contracts";
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

type StockLot = StockBalance["lots"][number];

function originLabel(origin: StockLot["origin"]): string {
  switch (origin.kind) {
    case "purchase":
      return `Compra del ${formatCalendarDayNumeric(origin.purchasedOn)} · ${origin.supplierName}`;
    case "initial_count":
      return "Inventario inicial";
    case "product_sales_without_lots":
      return "Ventas sin lotes del producto";
  }
}

function amountTone(amount: number | null, otherwise: "subtle" | undefined) {
  if (amount === null) {
    return "subtle";
  }
  return amount < 0 ? "error" : otherwise;
}

export function StockBalanceLots({ product }: { product: StockBalance }) {
  const columns = [
    dataColumn({
      id: "lot",
      width: 160,
      header: "Lote",
      render: (lot: StockLot) =>
        lot.technical ? (
          <TableCellText strong>Técnico</TableCellText>
        ) : (
          <TableCellText strong monospace>
            {lot.lotNumber ?? "—"}
          </TableCellText>
        ),
    }),
    dataColumn({
      id: "expiresOn",
      width: 150,
      header: "Vencimiento",
      render: (lot: StockLot) =>
        lot.expiresOn === null ? (
          <TableCellText tone="subtle">—</TableCellText>
        ) : (
          <TableCellText>{formatCalendarDayNumeric(lot.expiresOn)}</TableCellText>
        ),
    }),
    dataColumn({
      id: "origin",
      header: "Origen",
      render: (lot: StockLot) => (
        <TableCellText size="detail" tone="subtle">
          {originLabel(lot.origin)}
        </TableCellText>
      ),
    }),
    dataColumn({
      id: "remaining",
      width: 150,
      header: "Saldo",
      align: "end",
      render: (lot: StockLot) => (
        <TableCellText strong tone={amountTone(lot.remaining, undefined)}>
          {formatStockQuantity(lot.remaining, product.saleUnit)}
        </TableCellText>
      ),
    }),
    dataColumn({
      id: "unitCost",
      width: 160,
      header: "Costo unitario",
      align: "end",
      render: (lot: StockLot) => (
        <TableCellText tone={amountTone(lot.unitCostCents, "subtle")}>
          {formatStockUnitCost(lot.unitCostCents, product.saleUnit)}
        </TableCellText>
      ),
    }),
    dataColumn({
      id: "value",
      width: 170,
      header: "Valorizado",
      align: "end",
      render: (lot: StockLot) => (
        <TableCellText strong tone={amountTone(lot.valueCents, undefined)}>
          {formatStockValue(lot.valueCents)}
        </TableCellText>
      ),
    }),
  ] as const;

  const table = useTableModel({ items: product.lots, id: (lot) => lot.id, columns });

  return (
    <div className="flex flex-col gap-2">
      <Eyebrow
        text={product.lots.length > 1 ? "Lotes · se consume primero el que vence antes" : "Lotes"}
      />
      <Table table={table} aria-label={`Lotes de ${product.name}`} variant="nested" />
    </div>
  );
}
