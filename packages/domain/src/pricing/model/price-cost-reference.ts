import { type LotCost, STOCK_QUANTITY_PER_UNIT, unitCostCents } from "../../stock/index.js";
import { argentinaCalendarDay, type Fraction, roundHalfUp } from "../../shared/index.js";

export const FREIGHT_PER_UNIT_CENTS = 0;

export type CostSource =
  | {
      kind: "purchase_line";
      lineId: string;
      purchasedOn: string;
      recordedAt: Date;
      cost: LotCost;
    }
  | {
      kind: "initial_count";
      countedAt: Date;
      withdrawn: boolean;
      costIncomplete: boolean;
      cost: LotCost | null;
    };

export interface PriceCostReference {
  lastCostCents: number;
  freightPerUnitCents: number;
  totalCostCents: number;
  marginTenthsOfPercent: number | null;
}

interface DatedCost {
  source: CostSource;
  cost: LotCost;
  day: string;
  instant: number;
  lineId: string | null;
}

function datedCost(source: CostSource): DatedCost | null {
  if (source.kind === "purchase_line") {
    return {
      source,
      cost: source.cost,
      day: source.purchasedOn,
      instant: source.recordedAt.getTime(),
      lineId: source.lineId,
    };
  }
  if (source.withdrawn || source.costIncomplete || source.cost === null) {
    return null;
  }
  return {
    source,
    cost: source.cost,
    day: argentinaCalendarDay(source.countedAt),
    instant: source.countedAt.getTime(),
    lineId: null,
  };
}

function isMoreRecent(candidate: DatedCost, current: DatedCost): boolean {
  if (candidate.day !== current.day) {
    return candidate.day > current.day;
  }
  if (candidate.instant !== current.instant) {
    return candidate.instant > current.instant;
  }
  if (candidate.lineId === null || current.lineId === null) {
    return candidate.lineId !== null;
  }
  return candidate.lineId < current.lineId;
}

function lastDatedCost(sources: readonly CostSource[]): DatedCost | null {
  let last: DatedCost | null = null;
  for (const source of sources) {
    const candidate = datedCost(source);
    if (candidate !== null && (last === null || isMoreRecent(candidate, last))) {
      last = candidate;
    }
  }
  return last;
}

export function lastCostSource(sources: readonly CostSource[]): CostSource | null {
  return lastDatedCost(sources)?.source ?? null;
}

// Half up on a negative fraction rounds toward zero on a tie, which a truncating division gets wrong.
function roundHalfUpSigned(numerator: bigint, denominator: bigint): number {
  if (numerator >= 0n) {
    return roundHalfUp({ numerator, denominator });
  }
  const shift = (-numerator + denominator - 1n) / denominator;
  return roundHalfUp({ numerator: numerator + shift * denominator, denominator }) - Number(shift);
}

function totalCostFraction({ totalCents, quantity }: LotCost): Fraction {
  const denominator = BigInt(quantity);
  return {
    numerator:
      BigInt(totalCents) * BigInt(STOCK_QUANTITY_PER_UNIT) +
      BigInt(FREIGHT_PER_UNIT_CENTS) * denominator,
    denominator,
  };
}

function marginTenthsOfPercent(totalCost: Fraction, unitPrice: number): number {
  const priceNumerator = BigInt(unitPrice) * totalCost.denominator;
  return roundHalfUpSigned((priceNumerator - totalCost.numerator) * 1000n, priceNumerator);
}

export function priceCostReference(
  sources: readonly CostSource[],
  unitPrice: number | null,
): PriceCostReference | null {
  const last = lastDatedCost(sources);
  if (last === null) {
    return null;
  }
  const totalCost = totalCostFraction(last.cost);
  return {
    lastCostCents: unitCostCents(last.cost.totalCents, last.cost.quantity),
    freightPerUnitCents: FREIGHT_PER_UNIT_CENTS,
    totalCostCents: roundHalfUp(totalCost),
    marginTenthsOfPercent: unitPrice === null ? null : marginTenthsOfPercent(totalCost, unitPrice),
  };
}
