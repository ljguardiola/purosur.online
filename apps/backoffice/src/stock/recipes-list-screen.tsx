import type { RecipeSummary } from "@purosur/contracts";
import {
  actionsColumn,
  Button,
  dataColumn,
  FloatingNotification,
  SearchField,
  Table,
  TableCellText,
  type TableSort,
  textOrder,
  useTableModel,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { BookOpen, Check, Pencil, Plus, Search, SearchX } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { ScreenLayout } from "../shell/screen-layout";
import { StockTopBar } from "../shell/stock-top-bar";
import { EditRecipeModal } from "./edit-recipe-modal";
import { NewRecipeModal } from "./new-recipe-modal";
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
  filters: RecipesListFilters;
  onFiltersChange: (filters: RecipesListFilters) => void;
  onSessionEnded: () => void;
  services: RecipesListScreenServices;
};

type ScreenNotice = { id: number; title: string; description: string };

const NO_RECIPES: RecipeSummary[] = [];
const NO_PRODUCTS: never[] = [];

const productNameOrder = textOrder((recipe: RecipeSummary) => recipe.productName);

export function RecipesListScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: RecipesListScreenProps) {
  const data = useRecipesQuery({ fetchRecipes: services.fetchRecipes, onSessionEnded });
  const refreshStock = useRefreshStock();
  const [search, setSearch] = useState(filters.search);
  const [sort, setSort] = useState<TableSort<"product">>({
    column: "product",
    direction: "ascending",
  });
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RecipeSummary | null>(null);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const reportFilters = useEffectEvent(onFiltersChange);

  useEffect(() => {
    const shown: RecipesListFilters = { search };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, filters]);

  useEffect(() => {
    if (data.status === "failed") {
      setEditTarget(null);
    }
  }, [data.status]);

  const { recipes, products } =
    data.status === "loaded" ? data.value : { recipes: NO_RECIPES, products: NO_PRODUCTS };

  function saved(title: string, description: string) {
    setNotice((previous) => ({ id: (previous?.id ?? 0) + 1, title, description }));
    void refreshStock();
  }

  const columns = [
    dataColumn({
      id: "product",
      header: "Producto armado",
      sort: { order: productNameOrder, firstDirection: "ascending" },
      render: (item: RecipeSummary) => (
        <TableCellText strong description={recipeSubtitle(item)}>
          {item.productName}
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
      render: (_item: RecipeSummary) => <TableCellText tone="subtle">Sin tandas</TableCellText>,
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones",
      actions: [
        (item: RecipeSummary) => ({
          icon: <Pencil />,
          "aria-label": `Editar la receta de ${item.productName}`,
          onPress: () => setEditTarget(item),
        }),
      ],
    }),
  ] as const;

  const table = useTableModel({
    items: recipes,
    id: (recipe) => recipe.productId,
    search: { text: search, in: (recipe) => [recipe.productName] },
    columns,
    sort,
    onSortChange: setSort,
  });
  const matchCount = table.getRowModel().rows.length;

  return (
    <>
      <ScreenLayout
        topBar={
          <StockTopBar
            title="Recetas"
            action={
              <Button
                variant="primary"
                icon={<Plus />}
                dataStatus={data.status}
                onPress={() => setNewModalOpen(true)}
              >
                Nueva receta
              </Button>
            }
          />
        }
        bodyClassName="gap-4 p-6"
      >
        <div className="w-105">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Buscar un producto armado"
            icon={<Search />}
          />
        </div>
        <Table
          aria-label="Recetas"
          table={table}
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
      </ScreenLayout>
      <NewRecipeModal
        open={newModalOpen}
        products={products}
        recipes={recipes}
        services={services}
        onSaved={(recipe) => {
          setNewModalOpen(false);
          saved("Receta creada", `La receta de ${recipe.productName} ya está lista.`);
        }}
        onClose={() => setNewModalOpen(false)}
        onSessionEnded={onSessionEnded}
      />
      {data.status === "loaded" ? (
        <EditRecipeModal
          target={editTarget}
          products={products}
          services={services}
          onSaved={(recipe) => {
            setEditTarget(null);
            saved("Receta guardada", `Se reemplazó la receta de ${recipe.productName}.`);
          }}
          onClose={() => setEditTarget(null)}
          onSessionEnded={onSessionEnded}
        />
      ) : null}
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
