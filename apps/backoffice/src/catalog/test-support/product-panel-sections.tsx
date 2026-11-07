import type {
  ProductPanelSectionProps,
  ProductPanelSections,
  ProductRecipeSectionProps,
} from "../../platform/product-panel-sections";

export function productPanelSections({
  assembledProductIds = [],
}: {
  assembledProductIds?: readonly string[];
} = {}): ProductPanelSections {
  return {
    priceAndCost: ({ productName }: ProductPanelSectionProps) => (
      <p>{`Precio y costo de ${productName}`}</p>
    ),
    stockAndLots: ({ productName }: ProductPanelSectionProps) => (
      <p>{`Stock y lotes de ${productName}`}</p>
    ),
    recipeAndBatches: ({ productName, mayRegisterBatches }: ProductRecipeSectionProps) => (
      <p>{`Receta de ${productName}, tandas ${mayRegisterBatches ? "con" : "sin"} registro`}</p>
    ),
    recipeLookup: ({ productId, children }) =>
      children(assembledProductIds.includes(productId) ? "assembled" : "simple"),
  };
}
