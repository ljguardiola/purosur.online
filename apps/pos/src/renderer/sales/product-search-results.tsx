import type { FoundProduct } from "@purosur/contracts";
import { SEARCH_RESULT_LIMIT } from "@purosur/contracts";
import { EmptyState, formatCents, formatNumber, InlineNotice, plural } from "@purosur/ui";
import { Package, Scale, Search, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";

export type SearchResults = {
  query: string;
  products: FoundProduct[];
  more: boolean;
};

export type ProductSearchResultsProps = {
  listboxId: string;
  search: SearchResults | undefined;
  activeIndex: number;
  onChoose: (product: FoundProduct) => void;
};

export function searchOptionId(listboxId: string, index: number) {
  return `${listboxId}-option-${index}`;
}

const PANEL_POSITION_CLASS_NAME = "absolute inset-x-0 top-full z-overlay mt-2";
const PANEL_BOX_CLASS_NAME = "overflow-hidden rounded-lg border border-border bg-surface shadow-lg";

function HighlightedName({ product }: { product: FoundProduct }) {
  const parts: ReactNode[] = [];
  let next = 0;
  for (const { start, length } of product.matches) {
    parts.push(product.name.slice(next, start));
    parts.push(
      <mark key={start} className="bg-transparent font-bold text-text-accent">
        {product.name.slice(start, start + length)}
      </mark>,
    );
    next = start + length;
  }
  parts.push(product.name.slice(next));
  return parts;
}

function priceText(product: FoundProduct) {
  if (product.unit_price === null) {
    return "Sin precio";
  }
  return `${formatCents(product.unit_price)} / ${product.sale_unit === "KG" ? "kg" : "u"}`;
}

function ResultOption({
  id,
  product,
  active,
  onChoose,
}: {
  id: string;
  product: FoundProduct;
  active: boolean;
  onChoose: (product: FoundProduct) => void;
}) {
  const TypeIcon = product.sale_unit === "KG" ? Scale : Package;
  return (
    <button
      type="button"
      id={id}
      role="option"
      tabIndex={-1}
      aria-selected={active}
      onClick={() => onChoose(product)}
      className={[
        "flex h-14 w-full shrink-0 cursor-pointer items-center gap-4 px-4 text-left",
        active ? "bg-action-subtle" : "",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className="flex size-control-sm shrink-0 items-center justify-center rounded-full bg-surface-soft text-text-eyebrow"
      >
        <TypeIcon className="size-icon-md" />
      </span>
      <span className="min-w-0 flex-1 truncate text-subheading text-text">
        <HighlightedName product={product} />
      </span>
      <span className="shrink-0 text-right text-subheading text-text">{priceText(product)}</span>
    </button>
  );
}

// The live region stays mounted while there is nothing to tell: one that arrives already holding
// its text is not announced.
export function ProductSearchResults({
  listboxId,
  search,
  activeIndex,
  onChoose,
}: ProductSearchResultsProps) {
  const activeId = searchOptionId(listboxId, activeIndex);

  useEffect(() => {
    document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  return (
    <>
      <div role="status" className={PANEL_POSITION_CLASS_NAME}>
        {search?.products.length === 0 ? (
          <div className={PANEL_BOX_CLASS_NAME}>
            <EmptyState
              variant="filtered"
              icon={<Search />}
              title="Sin resultados"
              description={`No hay productos activos que coincidan con “${search.query}”. Corregí lo escrito en el campo.`}
            />
          </div>
        ) : null}
      </div>
      {search === undefined || search.products.length === 0 ? null : (
        <FoundProducts
          listboxId={listboxId}
          search={search}
          activeIndex={activeIndex}
          onChoose={onChoose}
        />
      )}
    </>
  );
}

function FoundProducts({
  listboxId,
  search: { products, more },
  activeIndex,
  onChoose,
}: ProductSearchResultsProps & { search: SearchResults }) {
  return (
    <div className={`${PANEL_POSITION_CLASS_NAME} ${PANEL_BOX_CLASS_NAME}`}>
      {/* Pressing an option must not take the focus away from the field. */}
      <div
        id={listboxId}
        role="listbox"
        tabIndex={0}
        onMouseDown={(event) => event.preventDefault()}
        aria-label="Resultados de la búsqueda"
        className="flex max-h-96 flex-col overflow-y-auto"
      >
        {products.map((product, index) => (
          <ResultOption
            key={product.product_id}
            id={searchOptionId(listboxId, index)}
            product={product}
            active={index === activeIndex}
            onChoose={onChoose}
          />
        ))}
      </div>
      {more ? (
        <div className="border-t border-border p-3">
          <InlineNotice
            tone="warning"
            icon={<TriangleAlert />}
            description={`Se muestran los primeros ${formatNumber(SEARCH_RESULT_LIMIT)} resultados y hay más. Escribí más letras para afinar la búsqueda.`}
          />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3 text-detail text-text-subtle">
          <span>
            {formatNumber(products.length)}{" "}
            {plural(products.length, { one: "resultado", other: "resultados" })} · primero los más
            vendidos en esta caja
          </span>
          <span>↑ ↓ elegir · Enter agregar · Esc cerrar</span>
        </div>
      )}
    </div>
  );
}
