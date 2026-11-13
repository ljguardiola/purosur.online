import type { ListedCashMovement } from "@purosur/contracts";
import { cashMovementTypeSchema } from "@purosur/contracts";
import type { CashMovementType } from "@purosur/domain";
import type { KeyLegendItem, TableLoadingState } from "@purosur/ui";
import {
  dataColumn,
  formatClockTime,
  formatNumber,
  ListFilter,
  plural,
  Table,
  TableCellText,
  TablePagination,
  useTableModel,
} from "@purosur/ui";
import { Receipt, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { CoreData } from "../platform/use-core-query";
import { directedAmount } from "./cash-amounts";
import { CASH_MOVEMENT_ICONS } from "./cash-movement-icons";

type Presentation = {
  label: string;
  detail: (movement: ListedCashMovement) => string | null;
};

const PRESENTATION = {
  OPENING: {
    label: "Apertura",
    detail: () => "Fondo inicial",
  },
  CASH_IN: {
    label: "Ingreso",
    detail: (movement) => movement.reason,
  },
  CASH_OUT: {
    label: "Gasto",
    detail: (movement) => movement.reason,
  },
  WITHDRAWAL: {
    label: "Retiro",
    detail: (movement) => movement.reason,
  },
  SALE: {
    label: "Venta",
    detail: () => "Cobro en efectivo",
  },
  CHANGE: {
    label: "Vuelto",
    detail: () => null,
  },
  REFUND: {
    label: "Devolución en efectivo",
    detail: () => null,
  },
  CLOSING: {
    label: "Cierre de sesión",
    detail: () => null,
  },
} as const satisfies Record<CashMovementType, Presentation>;

type TypeFilter = "ALL" | Exclude<CashMovementType, "CLOSING">;

const TYPE_FILTER_OPTIONS = [
  { value: "ALL", label: "Todos" },
  ...cashMovementTypeSchema.options
    .filter((type) => type !== "CLOSING")
    .map((type) => ({ value: type, label: PRESENTATION[type].label })),
] as const;

function timeOrder(a: ListedCashMovement, b: ListedCashMovement): number {
  return Date.parse(a.occurred_at) - Date.parse(b.occurred_at);
}

const columns = [
  dataColumn({
    id: "movement",
    header: "Movimiento",
    render: (movement: ListedCashMovement) => {
      const presentation = PRESENTATION[movement.type];
      return (
        <TableCellText
          icon={CASH_MOVEMENT_ICONS[movement.type]}
          description={presentation.detail(movement) ?? false}
        >
          {presentation.label}
        </TableCellText>
      );
    },
  }),
  dataColumn({
    id: "time",
    header: "Hora",
    sort: { order: timeOrder, firstDirection: "descending" },
    render: (movement: ListedCashMovement) => formatClockTime(movement.occurred_at),
  }),
  dataColumn({
    id: "person",
    header: "Quién",
    render: (movement: ListedCashMovement) => (
      <TableCellText
        description={
          movement.authorized_by === null ? false : `autorizó ${movement.authorized_by.first_name}`
        }
      >
        {movement.actor.first_name}
      </TableCellText>
    ),
  }),
  dataColumn({
    id: "amount",
    header: "Importe",
    align: "end",
    render: (movement: ListedCashMovement) => directedAmount(movement),
  }),
] as const;

export type CashMovementsTableProps = {
  state: CoreData<ListedCashMovement[]>;
  legend: readonly KeyLegendItem[];
  locked?: boolean;
};

function loadingOf(state: Exclude<CoreData<unknown>, { status: "failed" }>): TableLoadingState {
  if (state.status === "loading") {
    return "initial";
  }
  return state.refreshing ? "updating" : false;
}

export function CashMovementsTable({ state, legend, locked = false }: CashMovementsTableProps) {
  const movements = state.status === "loaded" ? state.value : [];
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ column: "time"; direction: "ascending" | "descending" }>({
    column: "time",
    direction: "descending",
  });
  const table = useTableModel({
    items: movements,
    id: (movement) => movement.id,
    filter: (movement) => typeFilter === "ALL" || movement.type === typeFilter,
    columns,
    sort,
    onSortChange: setSort,
    paging: { page, onPageChange: setPage },
  });
  const matchCount = table.getRowCount();

  function chooseTypeFilter(next: TypeFilter) {
    setTypeFilter(next);
    setPage(1);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col *:first:min-h-0">
      <Table
        aria-label="Movimientos de la sesión"
        table={table}
        fill
        legend={legend}
        {...(locked ? { locked: { label: "Movimientos bloqueados" } } : {})}
        {...(state.status === "failed"
          ? {
              failure: {
                icon: <TriangleAlert />,
                title: "No se pudieron leer los movimientos",
                description: "Volvé a intentarlo en unos segundos.",
                onRetry: state.retry,
              },
            }
          : { loading: loadingOf(state) })}
        empty={{
          icon: <Receipt />,
          ...(typeFilter === "ALL"
            ? { title: "Todavía no hay movimientos", variant: "blank" }
            : { title: "No hay movimientos de este tipo", variant: "filtered" }),
        }}
        legendAside={
          <div className="flex items-center gap-4">
            <ListFilter
              name="type"
              label="Tipo:"
              options={TYPE_FILTER_OPTIONS}
              value={typeFilter}
              onChange={chooseTypeFilter}
            />
            {matchCount === 0 ? null : (
              <>
                <p className="text-text-subtle text-detail">
                  {plural(matchCount, {
                    one: "1 movimiento",
                    other: `${formatNumber(matchCount)} movimientos`,
                  })}
                </p>
                <TablePagination table={table} label="Páginas de movimientos" />
              </>
            )}
          </div>
        }
      />
    </div>
  );
}
