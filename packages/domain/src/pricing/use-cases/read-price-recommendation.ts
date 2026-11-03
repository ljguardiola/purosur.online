import { roundHalfUp, type ZoneRulesSource } from "../../shared/index.js";
import { priceCostReference } from "../model/price-cost-reference.js";
import { type RecipeComponentQuantity, recommendedUnitPrice } from "../model/recommended-price.js";
import type { ActiveProductReader } from "./active-product-reader.js";
import type { AssemblyBatchCostReader } from "./assembly-batch-cost-reader.js";
import type { CurrentPriceReader } from "./current-price-reader.js";
import type { CurrentPrice } from "./pricing-store.js";

export interface ReadPriceRecommendationPorts {
  products: ActiveProductReader;
  currentPrices: CurrentPriceReader;
  batchCosts: AssemblyBatchCostReader;
  zoneRules: ZoneRulesSource;
}

export interface ReadPriceRecommendationInput {
  locationId: string;
  productId: string;
  components: readonly RecipeComponentQuantity[];
  unitPrice: number | null;
}

export type PriceRecommendation =
  | { kind: "recommended"; unitPrice: number }
  | { kind: "missing_prices"; componentProductIds: string[] };

export type BatchCostMargin =
  | { kind: "none" }
  | { kind: "incomplete" }
  | { kind: "known"; unitCostCents: number; marginTenthsOfPercent: number | null };

export type ReadPriceRecommendationOutcome =
  | { kind: "not_found" }
  | {
      kind: "read";
      currentPrice: CurrentPrice | null;
      recommendation: PriceRecommendation;
      batchCost: BatchCostMargin;
    };

export async function readPriceRecommendation(
  ports: ReadPriceRecommendationPorts,
  { locationId, productId, components, unitPrice }: ReadPriceRecommendationInput,
): Promise<ReadPriceRecommendationOutcome> {
  if (!(await ports.products.isActiveProduct(productId))) {
    return { kind: "not_found" };
  }
  const currentPrice = await ports.currentPrices.currentPriceOf(locationId, productId);
  const componentPrices = await ports.currentPrices.currentUnitPrices(locationId);
  const recommended = recommendedUnitPrice(components, componentPrices);
  const batches = await ports.batchCosts.batchLotCostsOf(locationId, [productId]);
  const reference = priceCostReference(
    batches.map(({ productId: _productId, ...batch }) => ({
      kind: "assembly_batch" as const,
      ...batch,
    })),
    unitPrice,
    ports.zoneRules.zoneRules(),
  );
  return {
    kind: "read",
    currentPrice,
    recommendation:
      recommended.kind === "recommended"
        ? { kind: "recommended", unitPrice: roundHalfUp(recommended.unitPrice) }
        : recommended,
    batchCost: batchCostMargin(reference),
  };
}

function batchCostMargin(reference: ReturnType<typeof priceCostReference>): BatchCostMargin {
  if (reference === null) {
    return { kind: "none" };
  }
  if (reference.costIncomplete) {
    return { kind: "incomplete" };
  }
  return {
    kind: "known",
    unitCostCents: reference.lastCostCents,
    marginTenthsOfPercent: reference.marginTenthsOfPercent,
  };
}
