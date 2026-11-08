import type { RecipeSummary } from "@purosur/contracts";
import {
  actionsColumn,
  Button,
  DetailPanel,
  dataColumn,
  FloatingNotification,
  SearchField,
  Table,
  TableCellText,
  type TableSort,
  textOrder,
  useTableModel,
} from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { deepEqual } from "@tanstack/react-router";
import { BookOpen, Check, Pencil, Plus, Search, SearchX } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import type { ProductCreationModal } from "../platform/creation-parts";
import type { ProductPriceSection } from "../platform/product-price-section";
import {
  type BackofficeAccess,
  canManageBatches,
  canManageProductsAndCategories,
  canSeePricesArea,
} from "../shell/backoffice-access";
import { BATCH_COST_INCOMPLETE, batchDayText, batchUnitCostText } from "./assembly-batch-text";
import type { AssemblyBatchesScreenServices } from "./assembly-batches-services";
import { EditRecipeModal } from "./edit-recipe-modal";
import { NewRecipeModal } from "./new-recipe-modal";
import { ProductRecipeSection } from "./product-recipe-section";
import {
  recipeComponentCountText,
  recipeComponentNamesText,
  recipeSubtitle,
  recipesCountText,
} from "./recipe-summary-text";
import type { RecipesListScreenServices } from "./recipes-list-services";
import type { RecipesListFilters } from "./routes";
import { useRecipesQuery, useRefreshStock } from "./stock-queries";

export type RecipesListScreenProps = {
  access: BackofficeAccess;
  productCreationModal: ProductCreationModal;
  productPriceSection: ProductPriceSection;
  filters: RecipesListFilters;
  onFiltersChange: (filters: RecipesListFilters) => void;
  openRecipe: string | undefined;
  onOpenRecipeChange: (recipe: string | undefined) => void;
  batchServices: AssemblyBatchesScreenServices;
  onSessionEnded: () => void;
  services: RecipesListScreenServices;
};

type ScreenNotice = { id: number; title: string; description: string };

const NO_RECIPES: RecipeSummary[] = [];
const NO_PRODUCTS: never[] = [];

const productDescriptionOrder = textOrder((recipe: RecipeSummary) =>
  formatProductDescription({
    name: recipe.productName,
    brandName: recipe.brandName,
    netContent: recipe.netContent,
  }),
);

function LastBatchCell({ recipe }: { recipe: RecipeSummary }) {
  const { lastBatch } = recipe;
  if (lastBatch === null) {
    return <TableCellText tone="subtle">Sin tandas</TableCellText>;
  }
  const cost = batchUnitCostText(lastBatch, recipe.saleUnit);
  return (
    <TableCellText
      strong={cost !== null}
      tone={cost === null ? "subtle" : undefined}
      description={batchDayText(lastBatch.assembledAt)}
    >
      {cost ?? BATCH_COST_INCOMPLETE}
    </TableCellText>
  );
}

export function RecipesListScreen({
  access,
  productCreationModal,
  productPriceSection,
  filters,
  onFiltersChange,
  openRecipe,
  onOpenRecipeChange,
  batchServices,
  onSessionEnded,
  services,
}: RecipesListScreenProps) {
  const data = useRecipesQuery({ fetchRecipes: services.fetchRecipes, onSessionEnded });
  const creation = canManageProductsAndCategories(access) ? { productCreationModal } : {};
  const maySetPrice = canSeePricesArea(access);
  const refreshStock = useRefreshStock();
  const [search, setSearch] = useState(filters.search);
  const [sort, setSort] = useState<TableSort<"product">>({
    column: "product",
    direction: filters.sort,
  });
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RecipeSummary | null>(null);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const reportFilters = useEffectEvent(onFiltersChange);
  const closeUnlisted = useEffectEvent(() => onOpenRecipeChange(undefined));

  useEffect(() => {
    const shown: RecipesListFilters = { search, sort: sort.direction };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, sort.direction, filters]);

  useEffect(() => {
    if (data.status === "failed") {
      setEditTarget(null);
    }
  }, [data.status]);

  const { recipes, products } =
    data.status === "loaded" ? data.value : { recipes: NO_RECIPES, products: NO_PRODUCTS };
  const recipeInPanel = recipes.find((recipe) => recipe.productId === openRecipe);

  useEffect(() => {
    if (data.status === "loaded" && openRecipe !== undefined && recipeInPanel === undefined) {
      closeUnlisted();
    }
  }, [data.status, openRecipe, recipeInPanel]);

  function saved(title: string, description: string) {
    setNotice((previous) => ({ id: (previous?.id ?? 0) + 1, title, description }));
    void refreshStock();
  }

  const columns = [
    dataColumn({
      id: "product",
      header: "Producto armado",
      sort: { order: productDescriptionOrder, firstDirection: "ascending" },
      render: (item: RecipeSummary) => (
        <TableCellText strong description={recipeSubtitle(item)}>
          {formatProductDescription({
            name: item.productName,
            brandName: item.brandName,
            netContent: item.netContent,
          })}
        </TableCellText>
      ),
    }),
    dataColumn({
      id: "components",
      header: "Componentes",
      render: (item: RecipeSummary) => (
        <TableCellText strong description={recipeComponentNamesText(item.components)}>
          {recipeComponentCountText(item.components.length)}
        </TableCellText>
      ),
    }),
    dataColumn({
      id: "lastBatch",
      header: "Costo de la última tanda",
      align: "end",
      render: (item: RecipeSummary) => <LastBatchCell recipe={item} />,
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones",
      actions: [
        (item: RecipeSummary) => ({
          icon: <Pencil />,
          "aria-label": `Editar la receta de ${formatProductDescription({ name: item.productName, brandName: item.brandName, netContent: item.netContent })}`,
          onPress: () => setEditTarget(item),
        }),
      ],
    }),
  ] as const;

  const table = useTableModel({
    items: recipes,
    id: (recipe) => recipe.productId,
    search: {
      text: search,
      in: (recipe) => [
        formatProductDescription({
          name: recipe.productName,
          brandName: recipe.brandName,
          netContent: recipe.netContent,
        }),
      ],
    },
    columns,
    sort,
    onSortChange: setSort,
  });
  const matchCount = table.getRowModel().rows.length;

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-105">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Buscar un producto armado"
              icon={<Search />}
            />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Button
              variant="primary"
              icon={<Plus />}
              dataStatus={data.status}
              onPress={() => setNewModalOpen(true)}
            >
              Nueva receta
            </Button>
          </div>
        </div>
        <Table
          aria-label="Recetas"
          table={table}
          onRowPress={(item) => onOpenRecipeChange(item.productId)}
          {...cloudTableState(data, "las recetas")}
          empty={
            recipes.length === 0
              ? {
                  icon: <BookOpen />,
                  title: "Todavía no hay productos armados",
                  description: "Una receta dice qué lleva un producto armado, como un mix.",
                  variant: "blank",
                }
              : {
                  icon: <SearchX />,
                  title: "Sin resultados",
                  description: "Probá con otro nombre.",
                  variant: "filtered",
                }
          }
          footer={
            matchCount === 0 ? undefined : (
              <p className="text-text-subtle text-detail">{recipesCountText(matchCount)}</p>
            )
          }
        />
      </div>
      <NewRecipeModal
        open={newModalOpen}
        products={products}
        recipes={recipes}
        {...creation}
        productPriceSection={productPriceSection}
        maySetPrice={maySetPrice}
        services={services}
        onSaved={(recipe) => {
          setNewModalOpen(false);
          saved(
            "Receta creada",
            `La receta de ${formatProductDescription({ name: recipe.productName, brandName: recipe.brandName, netContent: recipe.netContent })} ya está lista.`,
          );
        }}
        onClose={() => setNewModalOpen(false)}
        onSessionEnded={onSessionEnded}
      />
      {data.status === "loaded" ? (
        <EditRecipeModal
          target={editTarget}
          products={products}
          {...creation}
          productPriceSection={productPriceSection}
          maySetPrice={maySetPrice}
          services={services}
          onSaved={(recipe) => {
            setEditTarget(null);
            saved(
              "Receta guardada",
              `Se reemplazó la receta de ${formatProductDescription({ name: recipe.productName, brandName: recipe.brandName, netContent: recipe.netContent })}.`,
            );
          }}
          onClose={() => setEditTarget(null)}
          onSessionEnded={onSessionEnded}
        />
      ) : null}
      {recipeInPanel === undefined ? null : (
        <DetailPanel
          open
          onClose={() => onOpenRecipeChange(undefined)}
          recordKey={recipeInPanel.productId}
          title={formatProductDescription({
            name: recipeInPanel.productName,
            brandName: recipeInPanel.brandName,
            netContent: recipeInPanel.netContent,
          })}
        >
          <ProductRecipeSection
            productId={recipeInPanel.productId}
            productName={recipeInPanel.productName}
            saleUnit={recipeInPanel.saleUnit}
            mayRegisterBatches={canManageBatches(access)}
            onSessionEnded={onSessionEnded}
            services={{ ...batchServices, fetchRecipes: services.fetchRecipes }}
          />
        </DetailPanel>
      )}
      {notice ? (
        <FloatingNotification
          key={notice.id}
          tone="success"
          icon={<Check />}
          title={notice.title}
          description={notice.description}
          onDismiss={() => setNotice(null)}
        />
      ) : null}
    </>
  );
}
