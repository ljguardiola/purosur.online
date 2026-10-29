import type { DiscountTargets } from "@purosur/contracts";
import { discountTargets } from "./discounts";

type BenefitKinds = DiscountTargets["products"][number]["benefitKinds"];

export function targetsWithCreatedProduct(
  name: string,
  benefitKinds: BenefitKinds,
): DiscountTargets {
  return {
    ...discountTargets,
    products: [
      ...discountTargets.products,
      {
        id: "created-product",
        name,
        saleUnit: "UNIT",
        brandName: null,
        netContent: null,
        barcodes: [],
        benefitKinds,
      },
    ],
  };
}

export function targetsWithCreatedCategory(name: string): DiscountTargets {
  return {
    ...discountTargets,
    categories: [
      ...discountTargets.categories,
      { id: "created-category", name, parentId: null, benefitKinds: ["PERCENT_OFF"] },
    ],
  };
}

export function targetsWithCreatedTag(id: string, name: string): DiscountTargets {
  return {
    ...discountTargets,
    tags: [...discountTargets.tags, { id, name, benefitKinds: ["PERCENT_OFF"] }],
  };
}
