import { type FreightToDistribute, freightPerUnit } from "../../purchasing/index.js";
import { argentinaCalendarDay, type Fraction, roundHalfUp } from "../../shared/index.js";
import {
  knownLotCost,
  type LotCost,
  STOCK_QUANTITY_PER_UNIT,
  unitCostCents,
} from "../../stock/index.js";

export type CostSource =
  | {
      kind: "purchase_line";
      lineId: string;
      purchasedOn: string;
      recordedAt: Date;
      cost: LotCost;
      freights: FreightToDistribute[];
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
  const cost = source.withdrawn ? null : knownLotCost(source);
  if (cost === null) {
    return null;
  }
  return {
    source,
    cost,
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

function unitCostFraction({ totalCents, quantity }: LotCost): Fraction {
  return {
    numerator: BigInt(totalCents) * BigInt(STOCK_QUANTITY_PER_UNIT),
    denominator: BigInt(quantity),
  };
}

function marginTenthsOfPercent(cost: Fraction, unitPrice: number): number {
  const priceNumerator = BigInt(unitPrice) * cost.denominator;
  return roundHalfUp({
    numerator: (priceNumerator - cost.numerator) * 1000n,
    denominator: priceNumerator,
  });
}

function noFreight(): Fraction {
  return { numerator: 0n, denominator: 1n };
}

function freightFraction({ source }: DatedCost): Fraction {
  return source.kind === "purchase_line"
    ? freightPerUnit(source.lineId, source.freights)
    : noFreight();
}

function sum(left: Fraction, right: Fraction): Fraction {
  return {
    numerator: left.numerator * right.denominator + right.numerator * left.denominator,
    denominator: left.denominator * right.denominator,
  };
}

export function priceCostReference(
  sources: readonly CostSource[],
  unitPrice: number | null,
): PriceCostReference | null {
  const last = lastDatedCost(sources);
  if (last === null) {
    return null;
  }
  const lastCost = unitCostFraction(last.cost);
  const freight = freightFraction(last);
  const totalCost = sum(lastCost, freight);
  return {
    lastCostCents: unitCostCents(last.cost.totalCents, last.cost.quantity),
    freightPerUnitCents: roundHalfUp(freight),
    totalCostCents: roundHalfUp(totalCost),
    marginTenthsOfPercent: unitPrice === null ? null : marginTenthsOfPercent(totalCost, unitPrice),
  };
}
