import { argentinaCalendarDay, type Fraction, roundHalfUp } from "../../shared/index.js";
import { type LotCost, STOCK_QUANTITY_PER_UNIT, unitCostCents } from "../../stock/index.js";

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
}

function datedCost(source: CostSource): DatedCost | null {
  if (source.kind === "purchase_line") {
    return {
      source,
      cost: source.cost,
      day: source.purchasedOn,
      instant: source.recordedAt.getTime(),
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
  };
}

function compare<T extends string | number>(a: T, b: T): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

function isPurchaseLine(dated: DatedCost): boolean {
  return dated.source.kind === "purchase_line";
}

function compareLowerLineId(a: DatedCost, b: DatedCost): number {
  return a.source.kind === "purchase_line" && b.source.kind === "purchase_line"
    ? compare(b.source.lineId, a.source.lineId)
    : 0;
}

function compareRecency(a: DatedCost, b: DatedCost): number {
  return (
    compare(a.day, b.day) ||
    compare(a.instant, b.instant) ||
    compare(isPurchaseLine(a) ? 1 : 0, isPurchaseLine(b) ? 1 : 0) ||
    compareLowerLineId(a, b)
  );
}

function lastDatedCost(sources: readonly CostSource[]): DatedCost | null {
  let last: DatedCost | null = null;
  for (const source of sources) {
    const candidate = datedCost(source);
    if (candidate !== null && (last === null || compareRecency(candidate, last) > 0)) {
      last = candidate;
    }
  }
  return last;
}

export function lastCostSource(sources: readonly CostSource[]): CostSource | null {
  return lastDatedCost(sources)?.source ?? null;
}

// roundHalfUp truncates a negative quotient toward zero, so the numerator is moved to a
// non-negative remainder first.
function roundHalfUpSigned(numerator: bigint, denominator: bigint): number {
  const wholes = numerator / denominator - 1n;
  const remainder = numerator - wholes * denominator;
  return Number(wholes) + roundHalfUp({ numerator: remainder, denominator });
}

function totalCostFraction(
  { totalCents, quantity }: LotCost,
  freightPerUnitCents: number,
): Fraction {
  const denominator = BigInt(quantity);
  return {
    numerator:
      BigInt(totalCents) * BigInt(STOCK_QUANTITY_PER_UNIT) +
      BigInt(freightPerUnitCents) * denominator,
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
  freightPerUnitCents = FREIGHT_PER_UNIT_CENTS,
): PriceCostReference | null {
  const last = lastDatedCost(sources);
  if (last === null) {
    return null;
  }
  const totalCost = totalCostFraction(last.cost, freightPerUnitCents);
  return {
    lastCostCents: unitCostCents(last.cost.totalCents, last.cost.quantity),
    freightPerUnitCents,
    totalCostCents: roundHalfUp(totalCost),
    marginTenthsOfPercent: unitPrice === null ? null : marginTenthsOfPercent(totalCost, unitPrice),
  };
}
