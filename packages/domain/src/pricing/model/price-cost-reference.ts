import { type FreightToDistribute, freightPerUnit } from "../../purchasing/index.js";
import {
  argentinaCalendarDay,
  type Fraction,
  roundHalfUp,
  type ZoneRules,
} from "../../shared/index.js";
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
      kind: "assembly_batch";
      batchId: string;
      assembledAt: Date;
      cost: LotCost;
      costIncomplete: boolean;
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
  costIncomplete: boolean;
}

interface DatedCost {
  source: CostSource;
  cost: LotCost;
  day: string;
  instant: number;
}

function datedCost(source: CostSource, rules: ZoneRules): DatedCost | null {
  if (source.kind === "purchase_line") {
    return {
      source,
      cost: source.cost,
      day: source.purchasedOn,
      instant: source.recordedAt.getTime(),
    };
  }
  if (source.kind === "assembly_batch") {
    return {
      source,
      cost: source.cost,
      day: argentinaCalendarDay(source.assembledAt, rules),
      instant: source.assembledAt.getTime(),
    };
  }
  const cost = source.withdrawn ? null : knownLotCost(source);
  if (cost === null) {
    return null;
  }
  return {
    source,
    cost,
    day: argentinaCalendarDay(source.countedAt, rules),
    instant: source.countedAt.getTime(),
  };
}

function compare<T extends string | number>(a: T, b: T): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

const KIND_PRECEDENCE: Record<CostSource["kind"], number> = {
  purchase_line: 2,
  assembly_batch: 1,
  initial_count: 0,
};

function sourceId({ source }: DatedCost): string | null {
  if (source.kind === "purchase_line") {
    return source.lineId;
  }
  return source.kind === "assembly_batch" ? source.batchId : null;
}

function compareLowerId(a: DatedCost, b: DatedCost): number {
  const aId = sourceId(a);
  const bId = sourceId(b);
  return aId !== null && bId !== null ? compare(bId, aId) : 0;
}

function compareRecency(a: DatedCost, b: DatedCost): number {
  return (
    compare(a.day, b.day) ||
    compare(a.instant, b.instant) ||
    compare(KIND_PRECEDENCE[a.source.kind], KIND_PRECEDENCE[b.source.kind]) ||
    compareLowerId(a, b)
  );
}

function lastDatedCost(sources: readonly CostSource[], rules: ZoneRules): DatedCost | null {
  let last: DatedCost | null = null;
  for (const source of sources) {
    const candidate = datedCost(source, rules);
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
  rules: ZoneRules,
): PriceCostReference | null {
  const last = lastDatedCost(sources, rules);
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
    costIncomplete: last.source.kind === "assembly_batch" && last.source.costIncomplete,
  };
}
