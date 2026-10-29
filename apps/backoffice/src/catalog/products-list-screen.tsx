import type {
  BrandSummary,
  CategorySummary,
  ListedProduct,
  ProductSummary,
  TagList,
} from "@purosur/contracts";
import {
  actionsColumn,
  Button,
  dataColumn,
  formatCents,
  ListFilter,
  plural,
  SearchField,
  StatusIndicator,
  sortedItems,
  Table,
  type TableSort,
  textOrder,
  useTableModel,
} from "@purosur/ui";
import { formatNetContent } from "@purosur/ui/formatters";
import { deepEqual } from "@tanstack/react-router";
import { Ban, Package, Pencil, Plus, Printer, RotateCcw, Search, SearchX } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import {
  categoriesInTreeOrder,
  categoryPathLabels,
  leafCategories,
} from "../platform/category-path";
import { cloudTableState } from "../platform/cloud-table-state";
import { combineCloudData } from "../platform/combine-cloud-data";
import { perSaleUnit } from "../platform/per-sale-unit";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { barcodesSummary } from "./barcodes-summary";
import {
  useBrandsQuery,
  useCategoriesQuery,
  useProductsQuery,
  useRefreshCatalog,
  useReloadProduct,
  useTagsQuery,
} from "./catalog-queries";
import { DeactivateProductModal } from "./deactivate-product-modal";
import { EditProductModal } from "./edit-product-modal";
import { NewProductModal } from "./new-product-modal";
import { PrintLabelsModal } from "./print-labels-modal";
import type { ProductSaleUnit, ProductStatusFilter } from "./products-api";
import type { ProductsListScreenServices } from "./products-list-services";
import { ReactivateProductModal } from "./reactivate-product-modal";
import type { ProductsListFilters } from "./routes";

export type ProductsListScreenProps = {
  filters: ProductsListFilters;
  onFiltersChange: (filters: ProductsListFilters) => void;
  onSessionEnded: () => void;
  services: ProductsListScreenServices;
};

const NO_PRODUCTS: ListedProduct[] = [];
const NO_CATEGORIES: CategorySummary[] = [];
const NO_BRANDS: BrandSummary[] = [];
const NO_TAG_LIST: TagList = { tags: [], taggedProductCount: 0 };

type CategoryFilter = "ALL" | string;
type BrandFilter = "ALL" | "NONE" | string;
type UnitFilter = "ALL" | ProductSaleUnit;

const UNIT_OPTION_LABELS = {
  UNIT: "Por unidad",
  KG: "Por peso",
} satisfies Record<ProductSaleUnit, string>;

const PRODUCTS_EMPTY_STATE = {
  active: { title: "No hay productos activos", description: "Creá uno para verlo en la lista." },
  inactive: { title: "No hay productos inactivos" },
  all: {
    title: "Todavía no hay productos",
    description: "Creá el primero para verlo en la lista.",
  },
} satisfies Record<ProductStatusFilter, { title: string; description?: string }>;

function productsCountText(params: { count: number; status: ProductStatusFilter }): string {
  if (params.status === "active") {
    return plural(params.count, {
      one: "1 producto activo",
      other: `${params.count} productos activos`,
    });
  }
  if (params.status === "inactive") {
    return plural(params.count, {
      one: "1 producto inactivo",
      other: `${params.count} productos inactivos`,
    });
  }
  return plural(params.count, { one: "1 producto", other: `${params.count} productos` });
}

function unitLabel(saleUnit: ProductSaleUnit): string {
  return UNIT_OPTION_LABELS[saleUnit];
}

function priceText(product: ListedProduct): string {
  return product.currentUnitPrice === null
    ? "Sin precio"
    : perSaleUnit(formatCents(product.currentUnitPrice), product.saleUnit);
}

const productNameOrder = textOrder((product: ListedProduct) => product.name);
const brandOrder = textOrder((brand: { label: string }) => brand.label);

export function ProductsListScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: ProductsListScreenProps) {
  const {
    fetchProducts: fetchProductsService,
    fetchCategories: fetchCategoriesService,
    fetchBrands: fetchBrandsService,
    fetchTags: fetchTagsService,
  } = services;
  const [search, setSearch] = useState(filters.search);
  const [chosenCategoryFilter, setChosenCategoryFilter] = useState<CategoryFilter>(
    filters.category,
  );
  const [chosenBrandFilter, setChosenBrandFilter] = useState<BrandFilter>(filters.brand);
  const [unitFilter, setUnitFilter] = useState<UnitFilter>(filters.unit);
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>(filters.status);
  const [sort, setSort] = useState<TableSort<"product">>({
    column: "product",
    direction: filters.sort,
  });
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductSummary | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<ProductSummary | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<ProductSummary | null>(null);
  const reportFilters = useEffectEvent(onFiltersChange);
  const refreshCatalog = useRefreshCatalog();
  const reloadProduct = useReloadProduct({
    status: statusFilter,
    fetchProducts: fetchProductsService,
  });

  const productsData = useProductsQuery({
    status: statusFilter,
    fetchProducts: fetchProductsService,
    onSessionEnded,
  });
  const categoriesData = useCategoriesQuery({
    fetchCategories: fetchCategoriesService,
    onSessionEnded,
  });
  const brandsData = useBrandsQuery({ fetchBrands: fetchBrandsService, onSessionEnded });
  const tagsData = useTagsQuery({ fetchTags: fetchTagsService, onSessionEnded });
  const data = combineCloudData(
    combineCloudData(combineCloudData(productsData, categoriesData), brandsData),
    tagsData,
  );
  const [[[products, categories], brands], { tags }] =
    data.status === "loaded"
      ? data.value
      : [[[NO_PRODUCTS, NO_CATEGORIES], NO_BRANDS], NO_TAG_LIST];

  useEffect(() => {
    if (data.status === "failed") {
      setPrintModalOpen(false);
      setEditTarget(null);
    }
  }, [data.status]);

  const offeredCategoryIds = new Set(leafCategories(categories).map(({ id }) => id));
  const categoryFilter =
    data.status === "loaded" &&
    chosenCategoryFilter !== "ALL" &&
    !offeredCategoryIds.has(chosenCategoryFilter)
      ? "ALL"
      : chosenCategoryFilter;

  const brandsWithProducts = brands.filter((brand) =>
    products.some((product) => product.brandId === brand.id),
  );
  const offeredBrandIds = new Set(brandsWithProducts.map(({ id }) => id));
  const brandFilter =
    data.status === "loaded" &&
    chosenBrandFilter !== "ALL" &&
    chosenBrandFilter !== "NONE" &&
    !offeredBrandIds.has(chosenBrandFilter)
      ? "ALL"
      : chosenBrandFilter;
  if (brandFilter !== chosenBrandFilter) {
    setChosenBrandFilter(brandFilter);
  }

  useEffect(() => {
    const shown: ProductsListFilters = {
      search,
      category: categoryFilter,
      brand: brandFilter,
      unit: unitFilter,
      status: statusFilter,
      sort: sort.direction,
    };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, categoryFilter, brandFilter, unitFilter, statusFilter, sort.direction, filters]);

  const categoryLabels = categoryPathLabels(categories);

  const categoryFilterOptions = [
    { value: "ALL" as const, label: "Todas" },
    ...categoriesInTreeOrder(categories)
      .filter((category) => offeredCategoryIds.has(category.id))
      .map((category) => ({
        value: category.id,
        label: categoryLabels.get(category.id) ?? category.name,
      })),
  ] as [{ value: CategoryFilter; label: string }, ...{ value: CategoryFilter; label: string }[]];

  const brandFilterOptions = [
    { value: "ALL" as const, label: "Todas" },
    { value: "NONE" as const, label: "Sin marca" },
    ...sortedItems(
      brandsWithProducts.map((brand) => ({ value: brand.id, label: brand.name })),
      { order: brandOrder, direction: "ascending" },
    ),
  ] as [{ value: BrandFilter; label: string }, ...{ value: BrandFilter; label: string }[]];

  const brandNames = new Map(brands.map((brand) => [brand.id, brand.name]));

  const unitFilterOptions = [
    { value: "ALL" as const, label: "Todas" },
    { value: "UNIT" as const, label: UNIT_OPTION_LABELS.UNIT },
    { value: "KG" as const, label: UNIT_OPTION_LABELS.KG },
  ] as const;

  const statusFilterOptions = [
    { value: "active" as const, label: "Activos" },
    { value: "inactive" as const, label: "Inactivos" },
    { value: "all" as const, label: "Todos" },
  ] as const;

  const columns = [
    dataColumn({
      id: "product",
      header: "Producto",
      sort: { order: productNameOrder, firstDirection: "ascending" },
      render: (item: ListedProduct) => item.name,
    }),
    dataColumn({
      id: "brand",
      header: "Marca",
      render: (item: ListedProduct) =>
        item.brandId === null ? "" : (brandNames.get(item.brandId) ?? ""),
    }),
    dataColumn({
      id: "netContent",
      header: "Contenido neto",
      render: (item: ListedProduct) =>
        item.netContent === null ? "" : formatNetContent(item.netContent),
    }),
    dataColumn({
      id: "barcodes",
      header: "Código de barras",
      render: (item: ListedProduct) => barcodesSummary(item.barcodes),
    }),
    dataColumn({
      id: "category",
      header: "Categoría",
      render: (item: ListedProduct) => categoryLabels.get(item.categoryId) ?? item.categoryName,
    }),
    dataColumn({
      id: "unit",
      header: "Unidad",
      render: (item: ListedProduct) => unitLabel(item.saleUnit),
    }),
    dataColumn({
      id: "price",
      header: "Precio",
      render: priceText,
    }),
    dataColumn({
      id: "status",
      header: "Estado",
      render: (item: ListedProduct) =>
        item.active ? (
          <StatusIndicator tone="success">Activo</StatusIndicator>
        ) : (
          <StatusIndicator tone="neutral">Inactivo</StatusIndicator>
        ),
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones",
      actions: [
        (item: ListedProduct) => ({
          icon: <Pencil />,
          "aria-label": `Editar el producto ${item.name}`,
          onPress: () => setEditTarget(item),
        }),
        (item: ListedProduct) =>
          item.active
            ? {
                icon: <Ban />,
                "aria-label": `Desactivar el producto ${item.name}`,
                onPress: () => setDeactivateTarget(item),
              }
            : {
                icon: <RotateCcw />,
                "aria-label": `Reactivar el producto ${item.name}`,
                onPress: () => setReactivateTarget(item),
              },
      ],
    }),
  ] as const;

  const table = useTableModel({
    items: products,
    id: (product) => product.id,
    search: { text: search, in: (product) => [product.name, ...product.barcodes] },
    filter: (product) =>
      (categoryFilter === "ALL" || product.categoryId === categoryFilter) &&
      (brandFilter === "ALL" ||
        (brandFilter === "NONE" ? product.brandId === null : product.brandId === brandFilter)) &&
      (unitFilter === "ALL" || product.saleUnit === unitFilter),
    columns,
    sort,
    onSortChange: setSort,
  });
  const matchCount = table.getRowModel().rows.length;

  function closeDeactivationAndRefresh() {
    setDeactivateTarget(null);
    void refreshCatalog();
  }

  function closeReactivationAndRefresh() {
    setReactivateTarget(null);
    void refreshCatalog();
  }

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
            <div className="flex flex-col justify-center">
              <p className="text-text-subtle text-detail">Catálogo</p>
              <ScreenTitle>Productos</ScreenTitle>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                icon={<Printer />}
                dataStatus={data.status}
                onPress={() => setPrintModalOpen(true)}
              >
                Imprimir etiquetas
              </Button>
              <Button
                variant="primary"
                icon={<Plus />}
                dataStatus={data.status}
                onPress={() => setNewModalOpen(true)}
              >
                Nuevo producto
              </Button>
            </div>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-105">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Buscar por nombre o código de barras"
              icon={<Search />}
            />
          </div>
          <ListFilter
            name="category"
            label="Categoría:"
            options={categoryFilterOptions}
            value={categoryFilter}
            onChange={setChosenCategoryFilter}
          />
          <ListFilter
            name="brand"
            label="Marca:"
            options={brandFilterOptions}
            value={brandFilter}
            onChange={setChosenBrandFilter}
            searchable
          />
          <ListFilter
            name="unit"
            label="Unidad:"
            options={unitFilterOptions}
            value={unitFilter}
            onChange={setUnitFilter}
          />
          <ListFilter
            name="status"
            label="Estado:"
            options={statusFilterOptions}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
        <Table
          aria-label="Productos"
          table={table}
          {...cloudTableState(data, "los productos")}
          empty={
            products.length === 0
              ? {
                  icon: <Package />,
                  ...PRODUCTS_EMPTY_STATE[statusFilter],
                  variant: "blank",
                }
              : {
                  icon: <SearchX />,
                  title: "Sin resultados",
                  description: "Probá con otro nombre o código de barras.",
                  variant: "filtered",
                }
          }
          footer={
            matchCount === 0 ? undefined : (
              <p className="text-text-subtle text-detail">
                {productsCountText({ count: matchCount, status: statusFilter })}
              </p>
            )
          }
        />
      </ScreenLayout>
      <NewProductModal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        onCreated={() => {
          setNewModalOpen(false);
          void refreshCatalog();
        }}
        onSessionEnded={onSessionEnded}
        categories={categories}
        brands={brands}
        tags={tags}
        services={services}
      />
      {data.status === "loaded" ? (
        <EditProductModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            void refreshCatalog();
          }}
          onSessionEnded={onSessionEnded}
          reload={reloadProduct}
          categories={categories}
          brands={brands}
          tags={tags}
          services={services}
        />
      ) : null}
      <DeactivateProductModal
        target={deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onDeactivated={closeDeactivationAndRefresh}
        onVanished={closeDeactivationAndRefresh}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <ReactivateProductModal
        target={reactivateTarget}
        onClose={() => setReactivateTarget(null)}
        onReactivated={closeReactivationAndRefresh}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <PrintLabelsModal
        open={printModalOpen && data.status === "loaded"}
        onClose={() => setPrintModalOpen(false)}
        onSessionEnded={onSessionEnded}
        products={products}
        onReload={refreshCatalog}
        services={services}
      />
    </>
  );
}
