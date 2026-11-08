import type { StockCount, StockMovement } from "@purosur/contracts";
import {
  dataColumn,
  Eyebrow,
  formatNumber,
  Table,
  TableCellText,
  Tag,
  useTableModel,
} from "@purosur/ui";
import { ArrowDownUp, ClipboardCheck } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatStockChange, formatStockQuantity } from "../platform/stock-quantity";
import type { StockMovementsScreenServices } from "./stock-movements-services";
import { formatStockDay, LONGEST_PERIOD_DAYS } from "./stock-period";
import { useStockCountsQuery, useStockMovementsQuery } from "./stock-queries";
import { REASON_LABELS } from "./stock-reason-labels";

type ProductMovementsProps = {
  productId: string;
  productName: string;
  services: Pick<StockMovementsScreenServices, "fetchStockCounts" | "fetchStockMovements">;
  onSessionEnded: () => void;
};

const NO_COUNTS: StockCount[] = [];

const NO_MOVEMENTS: StockMovement[] = [];

const countColumns = [
  dataColumn({
    id: "date",
    header: "Fecha",
    render: (count: StockCount) => formatStockDay(count.occurredAt),
  }),
  dataColumn({
    id: "counted",
    header: "Contado",
    align: "end",
    render: (count: StockCount) => formatStockQuantity(count.counted, count.saleUnit),
  }),
  dataColumn({
    id: "difference",
    header: "Diferencia",
    align: "end",
    render: (count: StockCount) => (
      <TableCellText tone={count.delta < 0 ? "error" : "subtle"}>
        {count.delta === 0 ? "Sin diferencia" : formatStockChange(count.delta, count.saleUnit)}
      </TableCellText>
    ),
  }),
] as const;

const movementColumns = [
  dataColumn({
    id: "date",
    header: "Fecha",
    render: (movement: StockMovement) => formatStockDay(movement.occurredAt),
  }),
  dataColumn({
    id: "kind",
    header: "Tipo",
    render: (movement: StockMovement) => (
      <Tag tone={movement.kind === "loss" ? "neutral" : "info"}>
        {movement.kind === "loss" ? "Pérdida" : "Ajuste"}
      </Tag>
    ),
  }),
  dataColumn({
    id: "reason",
    header: "Motivo",
    render: (movement: StockMovement) => REASON_LABELS[movement.reason],
  }),
  dataColumn({
    id: "quantity",
    header: "Cantidad",
    align: "end",
    render: (movement: StockMovement) => formatStockChange(movement.delta, movement.saleUnit),
  }),
] as const;

function ProductCounts({
  productId,
  productName,
  services,
  onSessionEnded,
}: ProductMovementsProps) {
  const data = useStockCountsQuery({
    days: LONGEST_PERIOD_DAYS,
    fetchStockCounts: services.fetchStockCounts,
    onSessionEnded,
  });
  const table = useTableModel({
    items: data.status === "loaded" ? data.value.counts : NO_COUNTS,
    id: (count) => count.id,
    filter: (count) => count.productId === productId,
    columns: countColumns,
  });
  return (
    <Table
      table={table}
      aria-label={`Recuentos de ${productName}`}
      variant="nested"
      {...cloudTableState(data, "los recuentos")}
      empty={{
        icon: <ClipboardCheck />,
        title: `Sin recuentos en los últimos ${formatNumber(LONGEST_PERIOD_DAYS)} días`,
        variant: "blank",
      }}
    />
  );
}

function ProductMovements({
  productId,
  productName,
  services,
  onSessionEnded,
}: ProductMovementsProps) {
  const data = useStockMovementsQuery({
    days: LONGEST_PERIOD_DAYS,
    fetchStockMovements: services.fetchStockMovements,
    onSessionEnded,
  });
  const table = useTableModel({
    items: data.status === "loaded" ? data.value.movements : NO_MOVEMENTS,
    id: (movement) => movement.id,
    filter: (movement) => movement.productId === productId,
    columns: movementColumns,
  });
  return (
    <Table
      table={table}
      aria-label={`Ajustes y pérdidas de ${productName}`}
      variant="nested"
      {...cloudTableState(data, "los ajustes y las pérdidas")}
      empty={{
        icon: <ArrowDownUp />,
        title: `Sin ajustes ni pérdidas en los últimos ${formatNumber(LONGEST_PERIOD_DAYS)} días`,
        variant: "blank",
      }}
    />
  );
}

export function StockBalanceMovements(
  props: ProductMovementsProps & { showsCounts: boolean; showsMovements: boolean },
) {
  const { showsCounts, showsMovements, ...rest } = props;
  if (!showsCounts && !showsMovements) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      <Eyebrow text={`Movimientos de los últimos ${formatNumber(LONGEST_PERIOD_DAYS)} días`} />
      {showsCounts ? <ProductCounts {...rest} /> : null}
      {showsMovements ? <ProductMovements {...rest} /> : null}
    </div>
  );
}
