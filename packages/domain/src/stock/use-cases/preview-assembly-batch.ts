import {
  type AssemblyProposal,
  assemblyProposal,
  type BatchComponentUse,
  type BatchLotFacts,
  batchLotFacts,
  type ConsumedAllocation,
  pairedWithRecipe,
  usedQuantityRefusal,
} from "../model/assembly-batch.js";
import { movementAllocations } from "../model/lot-allocation.js";
import { isMovementQuantity } from "../model/stock-quantity.js";
import type { BatchLotReader } from "./batch-lot-reader.js";
import type { RecipeListReader } from "./recipe-list-reader.js";

export interface PreviewAssemblyBatchInput {
  productId: string;
  locationId: string;
  size: number;
  used?: readonly BatchComponentUse[];
  output?: number;
}

export interface PreviewAssemblyBatchPorts {
  recipes: RecipeListReader;
  lots: BatchLotReader;
}

export interface PlannedComponentAllocation {
  lotId: string | null;
  quantity: number;
  expiresOn: string | null;
}

export interface PlannedComponent {
  componentProductId: string;
  allocations: PlannedComponentAllocation[];
}

export type PreviewAssemblyBatchOutcome =
  | { kind: "no_recipe" }
  | { kind: "invalid_size" }
  | { kind: "stale_recipe" }
  | { kind: "invalid_quantity"; componentProductId: string }
  | { kind: "invalid_output" }
  | {
      kind: "previewed";
      recipeVersion: number;
      proposal: AssemblyProposal;
      used: BatchComponentUse[];
      planned: PlannedComponent[];
      lot: BatchLotFacts | null;
    };

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

  const planned: PlannedComponent[] = [];
  const consumed: ConsumedAllocation[] = [];
  for (const use of paired) {
    const componentLots = await lots.productLots({
      productId: use.componentProductId,
      locationId: input.locationId,
    });
    const allocations: PlannedComponentAllocation[] = [];
    for (const { target, quantity } of use.quantity === 0
      ? []
      : movementAllocations(componentLots, -use.quantity)) {
      const lot =
        target.kind === "lot"
          ? componentLots.find((candidate) => candidate.id === target.lotId)
          : undefined;
      allocations.push({
        lotId: target.kind === "lot" ? target.lotId : null,
        quantity: -quantity,
        expiresOn: lot?.expiresOn ?? null,
      });
      consumed.push({
        quantity: -quantity,
        cost: lot?.cost ?? null,
        costIncomplete: lot?.costIncomplete ?? true,
        expiresOn: lot?.expiresOn ?? null,
      });
    }
    planned.push({ componentProductId: use.componentProductId, allocations });
  }

  const output = input.output ?? proposal.output;
  return {
    kind: "previewed",
    recipeVersion: listing.version,
    proposal,
    used: paired.map(({ componentProductId, quantity }) => ({ componentProductId, quantity })),
    planned,
    lot:
      output !== null && isMovementQuantity(listing.saleUnit, output)
        ? batchLotFacts(consumed, output)
        : null,
  };
}
