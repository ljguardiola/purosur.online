import type {
  ProductPanelSectionProps,
  ProductPanelSections,
  ProductPriceCostSectionProps,
  ProductRecipeSectionProps,
} from "../../platform/product-panel-sections";

export function productPanelSections({
  assembledProductIds = [],
}: {
  assembledProductIds?: readonly string[];
} = {}): ProductPanelSections {
  return {
    priceAndCost: ({ productName, onPriceChanged }: ProductPriceCostSectionProps) => (
      <>
        <p>{`Precio y costo de ${productName}`}</p>
        <button type="button" onClick={onPriceChanged}>
          Guardar un precio de prueba
        </button>
      </>
    ),
    stockAndLots: ({ productName }: ProductPanelSectionProps) => (
      <p>{`Stock y lotes de ${productName}`}</p>
    ),
    recipeAndBatches: ({ productName, mayManageBatches }: ProductRecipeSectionProps) => (
      <p>{`Receta de ${productName}, producciones ${mayManageBatches ? "con" : "sin"} registro`}</p>
    ),
    recipeLookup: ({ productId, children }) =>
      children(assembledProductIds.includes(productId) ? "assembled" : "simple"),
  };
}
