import { type Fraction, roundHalfUp } from "../../shared/index.js";
import { STOCK_QUANTITY_PER_UNIT } from "../../stock/index.js";

export interface FreightLine {
  id: string;
  costPaidCents: number;
  quantity: number;
  quantityPerPackage: number;
}

export interface FreightShare {
  lineId: string;
  cents: number;
}

export interface FreightToDistribute {
  amountCents: number;
  lines: readonly FreightLine[];
}

export function lineValue({ costPaidCents, quantity, quantityPerPackage }: FreightLine): Fraction {
  return {
    numerator: BigInt(costPaidCents) * BigInt(quantity),
    denominator: BigInt(quantityPerPackage),
  };
}

export function hasDistributableValue(lines: readonly FreightLine[]): boolean {
  return lines.some((line) => lineValue(line).numerator > 0n);
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  return right === 0n ? left : greatestCommonDivisor(right, left % right);
}

function compare<T extends string | bigint>(a: T, b: T): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

function scaledWeights(lines: readonly FreightLine[]): { weights: bigint[]; denominator: bigint } {
  const values = lines.map(lineValue);
  const denominator = values.reduce(
    (common, value) =>
      (common * value.denominator) / greatestCommonDivisor(common, value.denominator),
    1n,
  );
  return {
    weights: values.map((value) => value.numerator * (denominator / value.denominator)),
    denominator,
  };
}

export function purchaseValueCents(lines: readonly FreightLine[]): number {
  const { weights, denominator } = scaledWeights(lines);
  return roundHalfUp({ numerator: weights.reduce((sum, weight) => sum + weight, 0n), denominator });
}

export function distributeFreight(
  amountCents: number,
  lines: readonly FreightLine[],
): FreightShare[] {
  const { weights } = scaledWeights(lines);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0n);
  if (totalWeight === 0n) {
    throw new Error("A freight cannot be distributed across lines worth nothing");
  }
  const amount = BigInt(amountCents);
  const shares = lines
    .map(({ id }, index) => {
      const scaled = amount * (weights[index] as bigint);
      return { lineId: id, cents: scaled / totalWeight, remainder: scaled % totalWeight };
    })
    .sort((left, right) => compare(left.lineId, right.lineId));
  const leftover = Number(amount - shares.reduce((sum, { cents }) => sum + cents, 0n));
  const byLargestRemainder = [...shares].sort(
    (left, right) => compare(right.remainder, left.remainder) || compare(left.lineId, right.lineId),
  );
  const raised = new Set(byLargestRemainder.slice(0, leftover).map(({ lineId }) => lineId));
  return shares.map(({ lineId, cents }) => ({
    lineId,
    cents: Number(cents) + (raised.has(lineId) ? 1 : 0),
  }));
}

export function freightPerUnit(lineId: string, freights: readonly FreightToDistribute[]): Fraction {
  let cents = 0;
  let quantity: number | undefined;
  for (const freight of freights) {
    const line = freight.lines.find(({ id }) => id === lineId);
    if (line) {
      quantity = line.quantity;
      const shares = distributeFreight(freight.amountCents, freight.lines);
      cents += (shares.find((share) => share.lineId === lineId) as FreightShare).cents;
    }
  }
  return {
    numerator: BigInt(cents) * BigInt(STOCK_QUANTITY_PER_UNIT),
    denominator: BigInt(quantity ?? 1),
  };
}
