import { formatCents, formatPricePerSaleUnit, Tag } from "@purosur/ui";
import { supplierPriceListRowStatusOf } from "./supplier-price-list-row-status";
import type { SupplierPriceListRow } from "./supplier-price-lists-api";

function detailOf(row: SupplierPriceListRow): string {
  return [
    row.code === null ? null : `Cód. ${row.code}`,
    row.presentation,
    row.page === null ? null : `página ${row.page}`,
  ]
    .filter((part) => part !== null)
    .join(" · ");
}

export function RowItemCell({ row }: { row: SupplierPriceListRow }) {
  const detail = detailOf(row);
  return (
    <div className="flex flex-col">
      <span>{row.description}</span>
      {detail === "" ? null : <span className="text-detail text-text-subtle">{detail}</span>}
    </div>
  );
}

export function RowPriceCell({ row }: { row: SupplierPriceListRow }) {
  if (row.priceCents === null) {
    return <span className="font-semibold text-error">Sin precio</span>;
  }
  return (
    <div className="flex flex-col items-end">
      <span>{formatCents(row.priceCents)}</span>
      {row.link === null || row.pricePerSaleUnit === null ? null : (
        <span className="text-detail text-text-subtle">
          {formatPricePerSaleUnit(row.pricePerSaleUnit, row.link.product.saleUnit)}
        </span>
      )}
    </div>
  );
}

export function RowLinkCell({ row }: { row: SupplierPriceListRow }) {
  if (row.link === null) {
    return <span className="font-semibold text-error">Sin vincular</span>;
  }
  return (
    <div className="flex flex-col">
      <span>{row.link.product.name}</span>
      <span className="text-detail text-text-subtle">{row.link.packaging.name}</span>
      {row.link.packaging.buyable ? null : (
        <span className="text-detail text-warning-strong">
          Ya no se compra en esta presentación
        </span>
      )}
    </div>
  );
}

export function RowStatusCell({ row }: { row: SupplierPriceListRow }) {
  const { tone, label } = supplierPriceListRowStatusOf(row.status);
  return (
    <div className="flex flex-col items-start gap-1">
      <Tag tone={tone} variant="status">
        {label}
      </Tag>
      {row.previousPriceCents === null ? null : (
        <span className="text-detail text-text-subtle">
          {`Antes ${formatCents(row.previousPriceCents)}`}
        </span>
      )}
    </div>
  );
}
