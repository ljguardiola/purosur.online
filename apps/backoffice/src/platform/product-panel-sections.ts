import type { SaleUnit } from "@purosur/domain";
import type { ComponentType } from "react";

export type ProductPanelSectionProps = {
  productId: string;
  productName: string;
  saleUnit: SaleUnit;
  onSessionEnded: () => void;
};

export type ProductRecipeSectionProps = ProductPanelSectionProps & {
  mayRegisterBatches: boolean;
};

export type ProductRecipeLookup = (params: {
  productId: string;
  enabled: boolean;
  onSessionEnded: () => void;
}) => "assembled" | "simple" | "unknown";

export type ProductPanelSections = {
  priceAndCost: ComponentType<ProductPanelSectionProps>;
  stockAndLots: ComponentType<ProductPanelSectionProps>;
  recipeAndBatches: ComponentType<ProductRecipeSectionProps>;
  useRecipeLookup: ProductRecipeLookup;
};
