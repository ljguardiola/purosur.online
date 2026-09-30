import type { OpenSale } from "@purosur/contracts";
import { EmptyState, formatCents } from "@purosur/ui";
import { Package, ShoppingBasket, Tag } from "lucide-react";
import { linePromotionText } from "./line-promotion-text";

type SaleLine = OpenSale["lines"][number];

function SaleLineRow({ line, changed }: { line: SaleLine; changed: boolean }) {
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
          <span className="flex items-center gap-1 text-detail font-bold text-success">
            <Tag aria-hidden="true" className="size-icon-xs shrink-0" />
            {linePromotionText(line.promotion)}
          </span>
        )}
      </span>
      <span className="w-33 shrink-0 text-center text-subheading text-text">{line.quantity}</span>
      <span className="flex w-37.5 shrink-0 flex-col text-right">
        {line.promotion === null ? null : (
          <s className="text-detail text-text-subtle">
            {formatCents(line.line_total + line.discount_amount)}
          </s>
        )}
        <span className="text-heading text-text">{formatCents(line.line_total)}</span>
      </span>
    </li>
  );
}

export function SaleLines({
  lines,
  changedLineId,
}: {
  lines: OpenSale["lines"];
  changedLineId: string | undefined;
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
        <SaleLineRow key={line.id} line={line} changed={line.id === changedLineId} />
      ))}
    </ul>
  );
}
