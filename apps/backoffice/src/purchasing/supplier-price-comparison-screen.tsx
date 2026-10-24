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

type OfferRow = {
  id: string;
  product: ComparedProduct;
  offer: Offer | null;
  first: boolean;
};

const NO_PRODUCTS: ComparedProduct[] = [];
const ALL_CATEGORIES = "";

const categoryOrder = textOrder((name: string) => name);

function rowsOf(products: readonly ComparedProduct[]): OfferRow[] {
  return products.flatMap((product): OfferRow[] =>
    product.offers.length === 0
      ? [{ id: product.id, product, offer: null, first: true }]
      : product.offers.map((offer, index) => ({
          id: `${product.id}/${offer.supplier.id}/${offer.packagingName}`,
          product,
          offer,
          first: index === 0,
        })),
  );
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
          <span>{row.offer.supplier.name}</span>
          {row.offer.cheapest ? (
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
        : `${row.offer.packagingName} · ${formatCents(row.offer.priceCents)}`,
  }),
  dataColumn({
    id: "perSaleUnit",
    header: "Por unidad de venta",
    align: "end",
    render: (row: OfferRow) =>
      row.offer === null ? null : (
        <span className="font-bold">
          {formatPricePerSaleUnit(row.offer.pricePerSaleUnit, row.product.saleUnit)}
        </span>
      ),
  }),
  dataColumn({
    id: "listDate",
    header: "Fecha de la lista",
    render: (row: OfferRow) => (row.offer === null ? null : formatDisplayDate(row.offer.listDate)),
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
  const shownCategory = categories.includes(category) ? category : ALL_CATEGORIES;

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
