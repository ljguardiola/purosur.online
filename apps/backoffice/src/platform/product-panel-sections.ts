import type { SaleUnit } from "@purosur/domain";
import type { ComponentType, ReactNode } from "react";

export type ProductPanelSectionProps = {
  productId: string;
  productName: string;
  saleUnit: SaleUnit;
  onSessionEnded: () => void;
};

export type ProductPriceCostSectionProps = ProductPanelSectionProps & {
  onPriceChanged: () => void;
};

export type ProductRecipeSectionProps = ProductPanelSectionProps & {
  mayManageBatches: boolean;
};

export type ProductRecipeLookupProps = {
  productId: string;
  enabled: boolean;
  onSessionEnded: () => void;
  children: (lookup: "assembled" | "simple" | "unknown") => ReactNode;
};

export type ProductPanelSections = {
  priceAndCost: ComponentType<ProductPriceCostSectionProps>;
  stockAndLots: ComponentType<ProductPanelSectionProps>;
  recipeAndBatches: ComponentType<ProductRecipeSectionProps>;
  recipeLookup: ComponentType<ProductRecipeLookupProps>;
};
