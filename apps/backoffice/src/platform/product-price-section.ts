import type { SaleUnit } from "@purosur/domain";
import type { ComponentType } from "react";

export type ProductPriceSectionProps = {
  productId: string;
  productDescription: string;
  saleUnit: SaleUnit;
  components: { componentProductId: string; name: string; quantityPerOutputUnit: number }[] | null;
  maySetPrice: boolean;
  onSessionEnded: () => void;
};

export type ProductPriceSection = ComponentType<ProductPriceSectionProps>;
