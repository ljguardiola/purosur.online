import type { BrandSummary, CategorySummary, ProductSummary, TagList } from "@purosur/contracts";
import {
  actionsColumn,
  Button,
  dataColumn,
  ListFilter,
  plural,
  SearchField,
  StatusIndicator,
  Table,
  type TableSort,
  textOrder,
  useTableModel,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { Ban, Package, Pencil, Plus, Printer, Search, SearchX } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { combineCloudData } from "../platform/combine-cloud-data";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import {
  useBrandsQuery,
  useCategoriesQuery,
  useProductsQuery,
  useRefreshCatalog,
  useReloadProduct,
  useTagsQuery,
} from "./catalog-queries";
import { categoriesInTreeOrder, categoryPathLabels, leafCategories } from "./category-path";
import { DeactivateProductModal } from "./deactivate-product-modal";
import { EditProductModal } from "./edit-product-modal";
import { NewProductModal } from "./new-product-modal";
import { PrintLabelsModal } from "./print-labels-modal";
import type { ProductSaleUnit, ProductStatusFilter } from "./products-api";
import type { ProductsListScreenServices } from "./products-list-services";
import type { ProductsListFilters } from "./routes";

export type ProductsListScreenProps = {
  filters: ProductsListFilters;
  onFiltersChange: (filters: ProductsListFilters) => void;
  onSessionEnded: () => void;
  services: ProductsListScreenServices;
};

const NO_PRODUCTS: ProductSummary[] = [];
const NO_CATEGORIES: CategorySummary[] = [];
const NO_BRANDS: BrandSummary[] = [];
const NO_TAG_LIST: TagList = { tags: [], taggedProductCount: 0 };

type CategoryFilter = "ALL" | string;
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

const productNameOrder = textOrder((product: ProductSummary) => product.name);

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

  useEffect(() => {
    const shown: ProductsListFilters = {
      search,
      category: categoryFilter,
      unit: unitFilter,
      status: statusFilter,
      sort: sort.direction,
    };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, categoryFilter, unitFilter, statusFilter, sort.direction, filters]);

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
      render: (item: ProductSummary) => item.name,
    }),
    dataColumn({
      id: "category",
      header: "Categoría",
      render: (item: ProductSummary) => categoryLabels.get(item.categoryId) ?? item.categoryName,
    }),
    dataColumn({
      id: "unit",
      header: "Unidad",
      render: (item: ProductSummary) => unitLabel(item.saleUnit),
    }),
    dataColumn({
      id: "status",
      header: "Estado",
      render: (item: ProductSummary) =>
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
        (item: ProductSummary) => ({
          icon: <Pencil />,
          "aria-label": `Editar el producto ${item.name}`,
          onPress: () => setEditTarget(item),
        }),
        (item: ProductSummary) =>
          item.active
            ? {
                icon: <Ban />,
                "aria-label": `Desactivar el producto ${item.name}`,
                onPress: () => setDeactivateTarget(item),
              }
            : undefined,
      ],
    }),
  ] as const;

  const table = useTableModel({
    items: products,
    id: (product) => product.id,
    search: { text: search, in: (product) => [product.name, ...product.barcodes] },
    filter: (product) =>
      (categoryFilter === "ALL" || product.categoryId === categoryFilter) &&
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
            label="Categoría:"
            options={categoryFilterOptions}
            value={categoryFilter}
            onChange={setChosenCategoryFilter}
          />
          <ListFilter
            label="Unidad:"
            options={unitFilterOptions}
            value={unitFilter}
            onChange={setUnitFilter}
          />
          <ListFilter
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
