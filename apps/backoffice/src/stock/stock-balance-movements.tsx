import type { StockCount, StockMovement } from "@purosur/contracts";
import {
  dataColumn,
  Eyebrow,
  LoadFailure,
  LoadingPlaceholder,
  Table,
  TableCellText,
  Tag,
  useTableModel,
} from "@purosur/ui";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { formatStockChange, formatStockQuantity } from "../platform/stock-quantity";
import type { StockBalancesScreenServices } from "./stock-balances-services";
import { formatStockDay, LONGEST_PERIOD_DAYS } from "./stock-period";
import { useStockCountsQuery, useStockMovementsQuery } from "./stock-queries";
import { REASON_LABELS } from "./stock-reason-labels";

type ProductMovementsProps = {
  productId: string;
  productName: string;
  services: StockBalancesScreenServices;
  onSessionEnded: () => void;
};

function newestFirst<T extends { occurredAt: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
}

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

function CountsTable({ counts, name }: { counts: StockCount[]; name: string }) {
  const table = useTableModel({ items: counts, id: (count) => count.id, columns: countColumns });
  return <Table table={table} aria-label={`Recuentos de ${name}`} variant="nested" />;
}

function MovementsTable({ movements, name }: { movements: StockMovement[]; name: string }) {
  const table = useTableModel({
    items: movements,
    id: (movement) => movement.id,
    columns: movementColumns,
  });
  return <Table table={table} aria-label={`Ajustes y pérdidas de ${name}`} variant="nested" />;
}

function EmptyNote({ children }: { children: string }) {
  return <p className="text-text-subtle text-detail">{children}</p>;
}

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
  if (data.status === "loading") {
    return <LoadingPlaceholder variant="rows" rows={2} />;
  }
  if (data.status === "failed") {
    return <LoadFailure {...cloudLoadFailure(data, "los recuentos")} />;
  }
  const counts = newestFirst(data.value.counts.filter((count) => count.productId === productId));
  return counts.length === 0 ? (
    <EmptyNote>Sin recuentos de este producto</EmptyNote>
  ) : (
    <CountsTable counts={counts} name={productName} />
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
  if (data.status === "loading") {
    return <LoadingPlaceholder variant="rows" rows={2} />;
  }
  if (data.status === "failed") {
    return <LoadFailure {...cloudLoadFailure(data, "los ajustes y las pérdidas")} />;
  }
  const movements = newestFirst(
    data.value.movements.filter((movement) => movement.productId === productId),
  );
  return movements.length === 0 ? (
    <EmptyNote>Sin ajustes ni pérdidas de este producto</EmptyNote>
  ) : (
    <MovementsTable movements={movements} name={productName} />
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
      <Eyebrow text="Movimientos" />
      {showsCounts ? <ProductCounts {...rest} /> : null}
      {showsMovements ? <ProductMovements {...rest} /> : null}
    </div>
  );
}
