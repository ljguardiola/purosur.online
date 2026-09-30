import type { ListedCashMovement } from "@purosur/contracts";
import type { CashMovementType } from "@purosur/domain";
import { CASH_MOVEMENT_TYPES } from "@purosur/domain";
import type { Icon } from "@purosur/ui";
import { formatCents, ListFilter, plural, Table, TableCellText, tableRows } from "@purosur/ui";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Coins,
  Lock,
  Receipt,
  ShoppingBasket,
  TriangleAlert,
  Undo2,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { formatClockTime } from "../platform/clock-time";

type Presentation = {
  label: string;
  icon: Icon;
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
    icon: <Wallet />,
    iconClassName: GREEN,
    sign: "+",
    detail: () => "Fondo inicial",
  },
  CASH_IN: {
    label: "Ingreso de efectivo",
    icon: <ArrowDownToLine />,
    iconClassName: GREEN,
    sign: "+",
    detail: (movement) => movement.reason,
  },
  CASH_OUT: {
    label: "Gasto",
    icon: <Receipt />,
    iconClassName: EARTH,
    sign: "−",
    detail: (movement) => movement.reason,
  },
  WITHDRAWAL: {
    label: "Retiro a caja fuerte",
    icon: <ArrowUpFromLine />,
    iconClassName: EARTH,
    sign: "−",
    detail: (movement) => movement.reason,
  },
  SALE: {
    label: "Venta",
    icon: <ShoppingBasket />,
    iconClassName: GREEN,
    sign: "+",
    detail: () => "Cobro en efectivo",
  },
  CHANGE: {
    label: "Vuelto",
    icon: <Coins />,
    iconClassName: EARTH,
    sign: "−",
    detail: () => null,
  },
  REFUND: {
    label: "Devolución en efectivo",
    icon: <Undo2 />,
    iconClassName: EARTH,
    sign: "−",
    detail: () => null,
  },
  CLOSING: {
    label: "Cierre de sesión",
    icon: <Lock />,
    iconClassName: PLAIN,
    sign: "",
    detail: () => null,
  },
} as const satisfies Record<CashMovementType, Presentation>;

type TypeFilter = "ALL" | CashMovementType;

const TYPE_FILTER_OPTIONS = [
  { value: "ALL", label: "Todos" },
  ...CASH_MOVEMENT_TYPES.map((type) => ({ value: type, label: PRESENTATION[type].label })),
] as const;

function amountText(movement: ListedCashMovement): string {
  const { sign } = PRESENTATION[movement.type];
  const amount = formatCents(movement.amount);
  return sign === "" ? amount : `${sign} ${amount}`;
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
            {presentation.icon}
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

export type CashMovementsState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "loaded"; movements: ListedCashMovement[] };

export type CashMovementsTableProps = {
  state: CashMovementsState;
  onRetry: () => void;
};

export function CashMovementsTable({ state, onRetry }: CashMovementsTableProps) {
  const movements = state.status === "loaded" ? state.movements : [];
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
                onRetry,
              },
            }
          : { loading: state.status === "loading" ? "initial" : false })}
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
