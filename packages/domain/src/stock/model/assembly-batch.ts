import type { SaleUnit } from "../../catalog/index.js";
import { roundHalfUp } from "../../shared/index.js";
import type { LotCost } from "./lot-value.js";
import { isMovementQuantity, STOCK_QUANTITY_PER_UNIT } from "./stock-quantity.js";

export interface BatchComponentUse {
  componentProductId: string;
  quantity: number;
}

export interface ProposalComponent {
  componentProductId: string;
  saleUnit: SaleUnit;
  quantityPerOutputUnit: number;
}

export interface AssemblyProposal {
  used: BatchComponentUse[];
  output: number | null;
}

function proposedQuantity(saleUnit: SaleUnit, quantityPerOutputUnit: number, size: number): number {
  const exactTimesUnit = BigInt(quantityPerOutputUnit) * BigInt(size);
  const unit = BigInt(STOCK_QUANTITY_PER_UNIT);
  if (saleUnit === "KG") {
    return roundHalfUp({ numerator: exactTimesUnit, denominator: unit });
  }
  return (
    roundHalfUp({ numerator: exactTimesUnit, denominator: unit * unit }) * STOCK_QUANTITY_PER_UNIT
  );
}

export function assemblyProposal({
  saleUnit,
  size,
  components,
}: {
  saleUnit: SaleUnit;
  size: number;
  components: readonly ProposalComponent[];
}): AssemblyProposal {
  const used = components.map((component) => ({
    componentProductId: component.componentProductId,
    quantity: proposedQuantity(component.saleUnit, component.quantityPerOutputUnit, size),
  }));
  const sharesSaleUnit = components.every((component) => component.saleUnit === saleUnit);
  return {
    used,
    output: sharesSaleUnit ? used.reduce((sum, use) => sum + use.quantity, 0) : null,
  };
}

export interface ConsumedAllocation {
  quantity: number;
  cost: LotCost | null;
  expiresOn: string | null;
}

export interface BatchLotFacts {
  costTotalCents: number;
  costQuantity: number;
  costIncomplete: boolean;
  expiresOn: string | null;
}

function gcd(a: bigint, b: bigint): bigint {
  return b === 0n ? a : gcd(b, a % b);
}

export function batchLotFacts(
  allocations: readonly ConsumedAllocation[],
  output: number,
): BatchLotFacts {
  let numerator = 0n;
  let denominator = 1n;
  let costIncomplete = false;
  const expiries: string[] = [];
  for (const allocation of allocations) {
    const known = allocation.cost;
    if (known === null) {
      costIncomplete = true;
    } else {
      const lotDenominator = BigInt(known.quantity);
      numerator =
        numerator * lotDenominator +
        BigInt(allocation.quantity) * BigInt(known.totalCents) * denominator;
      denominator *= lotDenominator;
      const divisor = gcd(numerator, denominator);
      numerator /= divisor;
      denominator /= divisor;
    }
    if (allocation.expiresOn !== null) {
      expiries.push(allocation.expiresOn);
    }
  }
  return {
    costTotalCents: roundHalfUp({ numerator, denominator }),
    costQuantity: output,
    costIncomplete,
    expiresOn: expiries.sort()[0] ?? null,
  };
}

export interface InvalidUsedQuantity {
  kind: "invalid_quantity";
  componentProductId: string;
}

export type BatchQuantityRefusal =
  | InvalidUsedQuantity
  | { kind: "nothing_used" }
  | { kind: "invalid_output" };

export function pairedWithRecipe<TComponent extends { componentProductId: string }>(
  recipeComponents: readonly TComponent[],
  used: readonly BatchComponentUse[],
): (TComponent & { quantity: number })[] | null {
  if (used.length !== recipeComponents.length) {
    return null;
  }
  const paired: (TComponent & { quantity: number })[] = [];
  for (const component of recipeComponents) {
    const use = used.find(
      (candidate) => candidate.componentProductId === component.componentProductId,
    );
    if (use === undefined) {
      return null;
    }
    paired.push({ ...component, quantity: use.quantity });
  }
  return paired;
}

export function usedQuantityRefusal(
  components: readonly (BatchComponentUse & { saleUnit: SaleUnit })[],
): InvalidUsedQuantity | null {
  for (const { componentProductId, saleUnit, quantity } of components) {
    if (quantity !== 0 && !isMovementQuantity(saleUnit, quantity)) {
      return { kind: "invalid_quantity", componentProductId };
    }
  }
  return null;
}

export function batchQuantityRefusal({
  assembledSaleUnit,
  components,
  output,
}: {
  assembledSaleUnit: SaleUnit;
  components: readonly (BatchComponentUse & { saleUnit: SaleUnit })[];
  output: number;
}): BatchQuantityRefusal | null {
  const used = usedQuantityRefusal(components);
  if (used) {
    return used;
  }
  if (components.every((component) => component.quantity === 0)) {
    return { kind: "nothing_used" };
  }
  return isMovementQuantity(assembledSaleUnit, output) ? null : { kind: "invalid_output" };
}
