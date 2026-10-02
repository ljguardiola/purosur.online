import { DISCOUNT_BENEFIT_KINDS, type DiscountBenefit } from "../model/discount-benefit.js";
import { DISCOUNT_TARGET_KINDS, type DiscountTargetKind } from "../model/discount-target.js";
import {
  type AssignableTargetCandidate,
  isAssignableTarget,
  isTargetKindAllowedFor,
  targetAcceptsBenefit,
} from "../model/discount-target-eligibility.js";
import type {
  CategoryTargetCandidate,
  DiscountTargetReader,
  ProductTargetCandidate,
  TagTargetCandidate,
} from "./discount-target-reader.js";

export interface ListDiscountTargetsPorts {
  targets: DiscountTargetReader;
}

interface AcceptsBenefits {
  benefitKinds: DiscountBenefit["kind"][];
}

export type ListedProductTarget = Omit<ProductTargetCandidate, "active"> & AcceptsBenefits;
export type ListedCategoryTarget = CategoryTargetCandidate & AcceptsBenefits;
export type ListedTagTarget = Omit<TagTargetCandidate, "active"> & AcceptsBenefits;

export interface ListedDiscountTargets {
  products: ListedProductTarget[];
  categories: ListedCategoryTarget[];
  tags: ListedTagTarget[];
  targetKindsByBenefit: Record<DiscountBenefit["kind"], DiscountTargetKind[]>;
}

function acceptedBenefitKinds(candidate: AssignableTargetCandidate): DiscountBenefit["kind"][] {
  return DISCOUNT_BENEFIT_KINDS.filter((kind) => targetAcceptsBenefit(candidate, kind));
}

function allowedTargetKinds(benefitKind: DiscountBenefit["kind"]): DiscountTargetKind[] {
  return DISCOUNT_TARGET_KINDS.filter((targetKind) =>
    isTargetKindAllowedFor(benefitKind, targetKind),
  );
}

export async function listDiscountTargets({
  targets,
}: ListDiscountTargetsPorts): Promise<ListedDiscountTargets> {
  const candidates = await targets.targetCandidates();
  return {
    products: candidates.products.flatMap(({ active, ...product }) => {
      const candidate = { kind: "PRODUCT", active, saleUnit: product.saleUnit } as const;
      return isAssignableTarget(candidate)
        ? [{ ...product, benefitKinds: acceptedBenefitKinds(candidate) }]
        : [];
    }),
    categories: candidates.categories.map((category) => ({
      ...category,
      benefitKinds: acceptedBenefitKinds({ kind: "CATEGORY" }),
    })),
    tags: candidates.tags.flatMap(({ active, ...tag }) => {
      const candidate = { kind: "TAG", active } as const;
      return isAssignableTarget(candidate)
        ? [{ ...tag, benefitKinds: acceptedBenefitKinds(candidate) }]
        : [];
    }),
    targetKindsByBenefit: {
      PERCENT_OFF: allowedTargetKinds("PERCENT_OFF"),
      BUY_N_PAY_M: allowedTargetKinds("BUY_N_PAY_M"),
    },
  };
}
