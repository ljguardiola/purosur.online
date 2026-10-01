import type { ListedCashMovement } from "@purosur/contracts";
import { CASH_MOVEMENT_TYPES } from "@purosur/contracts";
import type { CashMovementType } from "@purosur/domain";
import type { TableLoadingState } from "@purosur/ui";
import { formatCents, ListFilter, plural, Table, TableCellText, tableRows } from "@purosur/ui";
import { Receipt, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { formatClockTime } from "../platform/clock-time";
import type { CoreData } from "../platform/use-core-query";
import { signedAmount } from "./cash-amounts";
import { CASH_MOVEMENT_ICONS } from "./cash-movement-icons";

type Presentation = {
  label: string;
  iconClassName: string;
  sign: "+" | "−" | "";
  detail: (movement: ListedCashMovement) => string | null;
};

const GREEN = "text-success-strong";
const EARTH = "text-text-eyebrow";
const PLAIN = "text-text-subtle";

const PRESENTATION = {
  OPENING: {
    label: "Apertura de sesión",
    iconClassName: GREEN,
    sign: "+",
    detail: () => "Fondo inicial",
  },
  CASH_IN: {
    label: "Ingreso de efectivo",
    iconClassName: GREEN,
    sign: "+",
    detail: (movement) => movement.reason,
  },
  CASH_OUT: {
    label: "Gasto",
    iconClassName: EARTH,
    sign: "−",
    detail: (movement) => movement.reason,
  },
  WITHDRAWAL: {
    label: "Retiro a caja fuerte",
    iconClassName: EARTH,
    sign: "−",
    detail: (movement) => movement.reason,
  },
  SALE: {
    label: "Venta",
    iconClassName: GREEN,
    sign: "+",
    detail: () => "Cobro en efectivo",
  },
  CHANGE: {
    label: "Vuelto",
    iconClassName: EARTH,
    sign: "−",
    detail: () => null,
  },
  REFUND: {
    label: "Devolución en efectivo",
    iconClassName: EARTH,
    sign: "−",
    detail: () => null,
  },
  CLOSING: {
    label: "Cierre de sesión",
    iconClassName: PLAIN,
    sign: "",
    detail: () => null,
  },
} as const satisfies Record<CashMovementType, Presentation>;

type TypeFilter = "ALL" | Exclude<CashMovementType, "CLOSING">;

const TYPE_FILTER_OPTIONS = [
  { value: "ALL", label: "Todos" },
  ...CASH_MOVEMENT_TYPES.filter((type) => type !== "CLOSING").map((type) => ({
    value: type,
    label: PRESENTATION[type].label,
  })),
] as const;

function amountText(movement: ListedCashMovement): string {
  const { sign } = PRESENTATION[movement.type];
  return sign === "" ? formatCents(movement.amount) : signedAmount(sign, movement.amount);
}

const columns = [
  {
    key: "time",
    header: "Hora",
    sortable: true,
    defaultDirection: "descending",
    render: (movement: ListedCashMovement) => formatClockTime(movement.occurred_at),
  },
  {
    key: "movement",
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
  },
  {
    key: "person",
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
  },
  {
    key: "amount",
    header: "Importe",
    align: "end",
    render: amountText,
  },
] as const;

export type CashMovementsTableProps = {
  state: CoreData<ListedCashMovement[]>;
};

function loadingOf(state: Exclude<CoreData<unknown>, { status: "failed" }>): TableLoadingState {
  if (state.status === "loading") {
    return "initial";
  }
  return state.refreshing ? "updating" : false;
}

export function CashMovementsTable({ state }: CashMovementsTableProps) {
  const movements = state.status === "loaded" ? state.value : [];
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [sort, setSort] = useState<{ column: "time"; direction: "ascending" | "descending" }>({
    column: "time",
    direction: "descending",
  });

  const { rows, matchCount } = tableRows({
    items: movements,
    id: (movement) => movement.id,
    filter: (movement) => typeFilter === "ALL" || movement.type === typeFilter,
    sort: {
      by: sort,
      orders: {
        time: (a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at),
      },
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <ListFilter
          label="Tipo:"
          options={TYPE_FILTER_OPTIONS}
          value={typeFilter}
          onChange={setTypeFilter}
        />
      </div>
      <Table
        aria-label="Movimientos de la sesión"
        columns={columns}
        rows={rows}
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
        sort={sort}
        onSortChange={setSort}
        empty={{
          icon: <Receipt />,
          title: "No hay movimientos de este tipo",
          variant: "blank",
        }}
        footer={
          matchCount === 0 ? undefined : (
            <p className="text-text-subtle text-detail">
              {plural(matchCount, {
                one: "1 movimiento",
                other: `${matchCount} movimientos`,
              })}
            </p>
          )
        }
      />
    </div>
  );
}
