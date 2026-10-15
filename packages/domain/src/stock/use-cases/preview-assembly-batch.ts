import {
  type AssemblyProposal,
  assemblyProposal,
  type BatchComponentUse,
  type BatchLotFacts,
  batchLotFacts,
  type ConsumedAllocation,
  pairedWithRecipe,
  proposedOutput,
  usedQuantityRefusal,
} from "../model/assembly-batch.js";
import { movementAllocations } from "../model/lot-allocation.js";
import { knownLotCost } from "../model/lot-value.js";
import { isMovementQuantity } from "../model/stock-quantity.js";
import { lotUnitCostCents } from "../model/unit-cost.js";
import type { BatchLotReader } from "./batch-lot-reader.js";
import type { RecipeListReader } from "./recipe-list-reader.js";

export interface PreviewAssemblyBatchInput {
  productId: string;
  locationId: string;
  size: number;
  used?: readonly BatchComponentUse[] | undefined;
  output?: number | undefined;
}

export interface PreviewAssemblyBatchPorts {
  recipes: RecipeListReader;
  lots: BatchLotReader;
}

export interface PreviewedBatchLot extends BatchLotFacts {
  unitCostCents: number | null;
}

export type PreviewAssemblyBatchOutcome =
  | { kind: "no_recipe" }
  | { kind: "invalid_size" }
  | { kind: "stale_recipe" }
  | { kind: "invalid_quantity"; componentProductId: string }
  | { kind: "invalid_output" }
  | { kind: "previewed"; proposal: AssemblyProposal; lot: PreviewedBatchLot | null };

export async function previewAssemblyBatch(
  { recipes, lots }: PreviewAssemblyBatchPorts,
  input: PreviewAssemblyBatchInput,
): Promise<PreviewAssemblyBatchOutcome> {
  const listing = await recipes.recipe(input.productId, input.locationId);
  if (listing === undefined) {
    return { kind: "no_recipe" };
  }
  if (!isMovementQuantity(listing.saleUnit, input.size)) {
    return { kind: "invalid_size" };
  }

  const proposal = assemblyProposal({
    saleUnit: listing.saleUnit,
    size: input.size,
    components: listing.components,
  });
  const paired = pairedWithRecipe(listing.components, input.used ?? proposal.used);
  if (paired === null) {
    return { kind: "stale_recipe" };
  }
  const refusal = usedQuantityRefusal(paired);
  if (refusal) {
    return refusal;
  }
  if (input.output !== undefined && !isMovementQuantity(listing.saleUnit, input.output)) {
    return { kind: "invalid_output" };
  }

  const consumed: ConsumedAllocation[] = [];
  for (const use of paired) {
    const componentLots = await lots.productLots({
      productId: use.componentProductId,
      locationId: input.locationId,
    });
    for (const { target, quantity } of movementAllocations(componentLots, -use.quantity)) {
      const lot =
        target.kind === "lot"
          ? componentLots.find((candidate) => candidate.id === target.lotId)
          : undefined;
      consumed.push({
        quantity: -quantity,
        cost: lot ? knownLotCost(lot) : null,
        expiresOn: lot?.expiresOn ?? null,
      });
    }
  }

  const proposed = { used: proposal.used, output: proposedOutput(listing.saleUnit, paired) };
  const output = input.output ?? proposed.output;
  const lot =
    output !== null && isMovementQuantity(listing.saleUnit, output)
      ? batchLotFacts(consumed, output)
      : null;
  return {
    kind: "previewed",
    proposal: proposed,
    lot: lot && {
      ...lot,
      unitCostCents: lotUnitCostCents({
        cost: { totalCents: lot.costTotalCents, quantity: lot.costQuantity },
        costIncomplete: lot.costIncomplete,
      }),
    },
  };
}
