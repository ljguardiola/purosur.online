import type { SaleUnit } from "@purosur/domain";
import type { ComponentType, ReactNode } from "react";

export type ProductPanelSectionProps = {
  productId: string;
  productName: string;
  saleUnit: SaleUnit;
  onSessionEnded: () => void;
};

export type ProductRecipeSectionProps = ProductPanelSectionProps & {
  mayRegisterBatches: boolean;
};

export type ProductRecipeLookupProps = {
  productId: string;
  enabled: boolean;
  onSessionEnded: () => void;
  children: (lookup: "assembled" | "simple" | "unknown") => ReactNode;
};

export type ProductPanelSections = {
  priceAndCost: ComponentType<ProductPanelSectionProps>;
  stockAndLots: ComponentType<ProductPanelSectionProps>;
  recipeAndBatches: ComponentType<ProductRecipeSectionProps>;
  recipeLookup: ComponentType<ProductRecipeLookupProps>;
};
