import type { SupplierPriceComparison } from "@purosur/contracts";
import {
  dataColumn,
  formatCents,
  formatNumber,
  formatPricePerSaleUnit,
  ListFilter,
  plural,
  SearchField,
  sortedItems,
  Table,
  Tag,
  textOrder,
  useTableModel,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { Scale, Search, SearchX } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatDisplayDate } from "../platform/display-date";
import { AreaTopBar } from "../shell/area-top-bar";
import { ScreenLayout } from "../shell/screen-layout";
import { useSupplierPriceComparisonQuery } from "./purchasing-queries";
import type { SupplierPriceComparisonFilters } from "./supplier-price-comparison-filters";
import type { SupplierPriceComparisonScreenServices } from "./supplier-price-comparison-services";

export type SupplierPriceComparisonScreenProps = {
  filters: SupplierPriceComparisonFilters;
  onFiltersChange: (filters: SupplierPriceComparisonFilters) => void;
  onSessionEnded: () => void;
  services: SupplierPriceComparisonScreenServices;
};

type ComparedProduct = SupplierPriceComparison["products"][number];
type Offer = ComparedProduct["offers"][number];
type UnpricedOffer = ComparedProduct["unpricedOffers"][number];

type OfferRow = {
  id: string;
  product: ComparedProduct;
  offer: { kind: "priced"; offer: Offer } | { kind: "unpriced"; offer: UnpricedOffer } | null;
  first: boolean;
};

const NO_PRODUCTS: ComparedProduct[] = [];
const ALL_CATEGORIES = "";

const UNPRICED_REASONS: Record<UnpricedOffer["reason"], string> = {
  vat_rate_missing: "Falta el IVA del ítem",
  packaging_not_buyable: "Ya no se compra en esta presentación",
};

const categoryOrder = textOrder((name: string) => name);

function rowsOf(products: readonly ComparedProduct[]): OfferRow[] {
  return products.flatMap((product): OfferRow[] => {
    const offers = [
      ...product.offers.map((offer) => ({ kind: "priced" as const, offer })),
      ...product.unpricedOffers.map((offer) => ({ kind: "unpriced" as const, offer })),
    ];
    return offers.length === 0
      ? [{ id: product.id, product, offer: null, first: true }]
      : offers.map((entry, index) => ({
          id: `${product.id}/${entry.kind}/${entry.offer.supplier.id}/${entry.offer.packagingName}`,
          product,
          offer: entry,
          first: index === 0,
        }));
  });
}

const columns = [
  dataColumn({
    id: "product",
    header: "Producto",
    render: (row: OfferRow) =>
      row.first ? (
        <div className="flex flex-col">
          <span>{row.product.name}</span>
          <span className="text-detail text-text-subtle">{row.product.categoryName}</span>
        </div>
      ) : null,
  }),
  dataColumn({
    id: "supplier",
    header: "Proveedor",
    render: (row: OfferRow) =>
      row.offer === null ? (
        <span className="text-text-subtle">Sin precio en ninguna lista cargada</span>
      ) : (
        <div className="flex items-center gap-2">
          <span>{row.offer.offer.supplier.name}</span>
          {row.offer.kind === "priced" && row.offer.offer.cheapest ? (
            <Tag tone="success" variant="status">
              El más barato
            </Tag>
          ) : null}
        </div>
      ),
  }),
  dataColumn({
    id: "price",
    header: "Presentación y precio",
    render: (row: OfferRow) =>
      row.offer === null
        ? null
        : `${row.offer.offer.packagingName} · ${formatCents(row.offer.offer.priceCents)}`,
  }),
  dataColumn({
    id: "perSaleUnit",
    header: "Por unidad de venta",
    align: "end",
    render: (row: OfferRow) => {
      if (row.offer === null) {
        return null;
      }
      return row.offer.kind === "priced" ? (
        <span className="font-bold">
          {formatPricePerSaleUnit(row.offer.offer.pricePerSaleUnit, row.product.saleUnit)}
        </span>
      ) : (
        <span className="text-detail text-warning-strong">
          {UNPRICED_REASONS[row.offer.offer.reason]}
        </span>
      );
    },
  }),
  dataColumn({
    id: "listDate",
    header: "Fecha de la lista",
    render: (row: OfferRow) =>
      row.offer === null ? null : formatDisplayDate(row.offer.offer.listDate),
  }),
] as const;

export function SupplierPriceComparisonScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: SupplierPriceComparisonScreenProps) {
  const data = useSupplierPriceComparisonQuery({
    fetchSupplierPriceComparison: services.fetchSupplierPriceComparison,
    onSessionEnded,
  });
  const [search, setSearch] = useState(filters.search);
  const [category, setCategory] = useState(filters.category);
  const reportFilters = useEffectEvent(onFiltersChange);

  useEffect(() => {
    const shown: SupplierPriceComparisonFilters = { search, category };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, category, filters]);

  const products = data.status === "loaded" ? data.value.products : NO_PRODUCTS;
  const categories = sortedItems([...new Set(products.map((product) => product.categoryName))], {
    order: categoryOrder,
    direction: "ascending",
  });
  const categoryIsOffered = category === ALL_CATEGORIES || categories.includes(category);
  const shownCategory = categoryIsOffered ? category : ALL_CATEGORIES;

  useEffect(() => {
    if (data.status === "loaded" && !categoryIsOffered) {
      setCategory(ALL_CATEGORIES);
    }
  }, [data.status, categoryIsOffered]);

  const table = useTableModel({
    items: rowsOf(products),
    id: (row) => row.id,
    search: { text: search, in: (row) => [row.product.name] },
    filter: (row) => shownCategory === ALL_CATEGORIES || row.product.categoryName === shownCategory,
    columns,
  });
  const shownRows = table.getRowModel().rows;
  const productCount = new Set(shownRows.map((row) => row.original.product.id)).size;

  return (
    <ScreenLayout
      topBar={<AreaTopBar eyebrow="Pedidos" title="Comparación de precios" />}
      bodyClassName="gap-4 p-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-105">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Buscar un producto"
            icon={<Search />}
          />
        </div>
        <ListFilter
          name="category"
          label="Categoría:"
          options={[
            { value: ALL_CATEGORIES, label: "Todas" },
            ...categories.map((name) => ({ value: name, label: name })),
          ]}
          value={shownCategory}
          onChange={setCategory}
        />
      </div>
      <Table
        aria-label="Comparación de precios"
        table={table}
        {...cloudTableState(data, "la comparación de precios")}
        empty={
          products.length === 0
            ? {
                icon: <Scale />,
                title: "Todavía no hay precios para comparar",
                variant: "blank",
              }
            : { icon: <SearchX />, title: "Sin resultados", variant: "filtered" }
        }
        footer={
          productCount === 0 ? undefined : (
            <p className="text-text-subtle text-detail">
              {`${formatNumber(productCount)} ${plural(productCount, { one: "producto", other: "productos" })}`}
            </p>
          )
        }
      />
    </ScreenLayout>
  );
}
