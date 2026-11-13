import type { ListedCashMovement } from "@purosur/contracts";
import type { CashMovementType } from "@purosur/domain";
import type { KeyLegendItem, TableLoadingState } from "@purosur/ui";
import { dataColumn, formatClockTime, Table, TableCellText, useTableModel } from "@purosur/ui";
import { Receipt, TriangleAlert } from "lucide-react";
import type { CoreData } from "../platform/use-core-query";
import { directedAmount } from "./cash-amounts";
import { CASH_MOVEMENT_ICONS } from "./cash-movement-icons";

type Presentation = {
  label: string;
  iconClassName: string;
  detail: (movement: ListedCashMovement) => string | null;
};

const GREEN = "text-success-strong";
const EARTH = "text-text-eyebrow";
const PLAIN = "text-text-subtle";

const PRESENTATION = {
  OPENING: {
    label: "Apertura",
    iconClassName: GREEN,
    detail: () => "Fondo inicial",
  },
  CASH_IN: {
    label: "Ingreso",
    iconClassName: GREEN,
    detail: (movement) => movement.reason,
  },
  CASH_OUT: {
    label: "Gasto",
    iconClassName: EARTH,
    detail: (movement) => movement.reason,
  },
  WITHDRAWAL: {
    label: "Retiro",
    iconClassName: EARTH,
    detail: (movement) => movement.reason,
  },
  SALE: {
    label: "Venta",
    iconClassName: GREEN,
    detail: () => "Cobro en efectivo",
  },
  CHANGE: {
    label: "Vuelto",
    iconClassName: EARTH,
    detail: () => null,
  },
  REFUND: {
    label: "Devolución en efectivo",
    iconClassName: EARTH,
    detail: () => null,
  },
  CLOSING: {
    label: "Cierre de sesión",
    iconClassName: PLAIN,
    detail: () => null,
  },
} as const satisfies Record<CashMovementType, Presentation>;

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
        <span className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={`inline-flex size-icon-lg shrink-0 *:size-full ${presentation.iconClassName}`}
          >
            {CASH_MOVEMENT_ICONS[movement.type]}
          </span>
          <TableCellText description={presentation.detail(movement) ?? false}>
            {presentation.label}
          </TableCellText>
        </span>
      );
    },
  }),
  dataColumn({
    id: "time",
    header: "Hora",
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
  const movements = state.status === "loaded" ? [...state.value].sort(timeOrder) : [];
  const table = useTableModel({
    items: movements,
    id: (movement) => movement.id,
    columns,
  });

  return (
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
      empty={{ icon: <Receipt />, title: "Todavía no hay movimientos", variant: "blank" }}
    />
  );
}
