import type { OpenSale } from "@purosur/contracts";
import { EmptyState, formatCents, IconButton, Tag } from "@purosur/ui";
import { Minus, Package, Plus, ShoppingBasket, TagIcon, Trash2 } from "lucide-react";
import { linePromotionText } from "./line-promotion-text";

type SaleLine = OpenSale["lines"][number];

export type SaleLineActions = {
  busy: boolean;
  onChangeQuantity: (line: SaleLine, quantity: number) => void;
  onRemove: (line: SaleLine) => void;
};

function SaleLineRow({
  line,
  changed,
  actions,
}: {
  line: SaleLine;
  changed: boolean;
  actions: SaleLineActions;
}) {
  return (
    <li
      aria-current={changed ? "true" : undefined}
      className={[
        "flex h-14 shrink-0 items-center gap-4 rounded-lg bg-surface px-4",
        changed ? "inset-ring-2 inset-ring-action" : "",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className="flex size-control-sm shrink-0 items-center justify-center rounded-full bg-surface-soft text-text-eyebrow"
      >
        <Package className="size-icon-md" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-subheading font-semibold text-text">
          {line.product_name}
        </span>
        {line.promotion === null ? null : (
          <span>
            <Tag tone="success" icon={<TagIcon />}>
              {linePromotionText(line.promotion)}
            </Tag>
          </span>
        )}
      </span>
      <span className="flex w-27 shrink-0 items-center justify-between">
        <IconButton
          aria-label={`Bajar la cantidad de ${line.product_name}`}
          icon={<Minus />}
          disabled={actions.busy || line.quantity <= 1}
          onPress={() => actions.onChangeQuantity(line, line.quantity - 1)}
        />
        <span className="text-subheading text-text">{line.quantity}</span>
        <IconButton
          aria-label={`Subir la cantidad de ${line.product_name}`}
          icon={<Plus />}
          disabled={actions.busy}
          onPress={() => actions.onChangeQuantity(line, line.quantity + 1)}
        />
      </span>
      <span className="flex w-37.5 shrink-0 flex-col text-right">
        {line.promotion === null ? null : (
          <s className="text-detail text-text-subtle">
            {formatCents(line.line_total + line.discount_amount)}
          </s>
        )}
        <span className="text-heading text-text">{formatCents(line.line_total)}</span>
      </span>
      <IconButton
        variant="subtle"
        aria-label={`Quitar ${line.product_name}`}
        icon={<Trash2 />}
        disabled={actions.busy}
        onPress={() => actions.onRemove(line)}
      />
    </li>
  );
}

export function SaleLines({
  lines,
  changedLineId,
  actions,
}: {
  lines: OpenSale["lines"];
  changedLineId: string | undefined;
  actions: SaleLineActions;
}) {
  if (lines.length === 0) {
    return (
      <EmptyState
        variant="blank"
        icon={<ShoppingBasket />}
        title="La venta está vacía"
        description="Escaneá un producto para agregarlo."
      />
    );
  }
  return (
    <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
      {lines.map((line) => (
        <SaleLineRow
          key={line.id}
          line={line}
          changed={line.id === changedLineId}
          actions={actions}
        />
      ))}
    </ul>
  );
}
