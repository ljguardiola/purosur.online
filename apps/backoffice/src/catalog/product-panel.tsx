import type { ListedProduct } from "@purosur/contracts";
import { Button, DetailPanel, SummaryRowGroup, Tab, Tabs } from "@purosur/ui";
import { formatNetContent } from "@purosur/ui/formatters";
import { createLink } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { landingPart, type PagePart, pagePartsFor } from "../platform/page-parts";
import type { ProductPanelSections } from "../platform/product-panel-sections";
import {
  type BackofficeAccess,
  canManageBatches,
  canManageProductsAndCategories,
  canManageRecipes,
  canSeePricesArea,
  canSeeStockBalances,
} from "../shell/backoffice-access";
import { barcodesSummary } from "./barcodes-summary";

export type ProductPanelProps = {
  product: ListedProduct;
  brandName: string | undefined;
  categoryLabel: string;
  tagNames: readonly string[];
  access: BackofficeAccess;
  sections: ProductPanelSections;
  tab?: string | undefined;
  onEdit: () => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

type ProductPanelTab = "data" | "price" | "stock" | "recipe";

const TAB_LABELS: Record<ProductPanelTab, string> = {
  data: "Datos",
  price: "Precio y costo",
  stock: "Stock y lotes",
  recipe: "Receta y tandas",
};

const SALE_UNIT_LABELS = { UNIT: "Por unidad", KG: "Por peso" } as const;

const ProductTabLink = createLink(Tab);

export function ProductPanel(props: ProductPanelProps) {
  const { product, access, sections, onSessionEnded } = props;
  const RecipeLookup = sections.recipeLookup;
  return (
    <RecipeLookup
      productId={product.id}
      enabled={canManageRecipes(access)}
      onSessionEnded={onSessionEnded}
    >
      {(recipe) => <ProductPanelBody {...props} recipe={recipe} />}
    </RecipeLookup>
  );
}

function ProductPanelBody({
  product,
  brandName,
  categoryLabel,
  tagNames,
  access,
  sections,
  tab,
  onEdit,
  onClose,
  onSessionEnded,
  recipe,
}: ProductPanelProps & { recipe: "assembled" | "simple" | "unknown" }) {
  const { priceAndCost: PriceAndCost, stockAndLots: StockAndLots } = sections;
  const { recipeAndBatches: RecipeAndBatches } = sections;
  const tabs: readonly PagePart<BackofficeAccess, ProductPanelTab>[] = [
    { key: "data", isVisibleTo: canManageProductsAndCategories },
    { key: "price", isVisibleTo: canSeePricesArea },
    { key: "stock", isVisibleTo: canSeeStockBalances },
    { key: "recipe", isVisibleTo: (own) => canManageRecipes(own) && recipe === "assembled" },
  ];
  const parts = pagePartsFor(access, tabs);
  if (parts.kind === "hidden") {
    return null;
  }
  const selectedTab = landingPart(parts, tab);
  const section = {
    productId: product.id,
    productName: product.name,
    saleUnit: product.saleUnit,
    onSessionEnded,
  };

  return (
    <DetailPanel open onClose={onClose} recordKey={product.id} title={product.name}>
      <Tabs
        label="Secciones del producto"
        selectedTab={selectedTab}
        tabs={parts.visible.map((key) => (
          <ProductTabLink
            key={key}
            from="/products"
            to="/products"
            search={(previous) => ({ ...previous, product: product.id, tab: key })}
            value={key}
            label={TAB_LABELS[key]}
          />
        ))}
      >
        {selectedTab === "data" && (
          <div className="flex flex-col gap-4 pt-4">
            <SummaryRowGroup
              variant="filled"
              rows={[
                { label: "Categoría", value: categoryLabel },
                { label: "Marca", value: brandName ?? "Sin marca" },
                { label: "Unidad", value: SALE_UNIT_LABELS[product.saleUnit] },
                {
                  label: "Contenido neto",
                  value: product.netContent === null ? "—" : formatNetContent(product.netContent),
                },
                { label: "Código de barras", value: barcodesSummary(product.barcodes) },
                { label: "Distintivos", value: tagNames.length === 0 ? "—" : tagNames.join(", ") },
                { label: "Estado", value: product.active ? "Activo" : "Inactivo" },
              ]}
            />
            <div className="flex">
              <Button variant="secondary" size="small" icon={<Pencil />} onPress={onEdit}>
                Editar
              </Button>
            </div>
          </div>
        )}
        {selectedTab === "price" && <PriceAndCost {...section} />}
        {selectedTab === "stock" && <StockAndLots {...section} />}
        {selectedTab === "recipe" && (
          <RecipeAndBatches {...section} mayRegisterBatches={canManageBatches(access)} />
        )}
      </Tabs>
    </DetailPanel>
  );
}
