import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_CASH_AMOUNT_CENTS } from "../../shared/index.js";
import {
  distributeFreight,
  type FreightLine,
  freightPerUnit,
  hasDistributableValue,
  lineValue,
} from "./freight-distribution.js";

function line(id: string, costPaidCents: number, quantity = 1000, quantityPerPackage = 1000) {
  return { id, costPaidCents, quantity, quantityPerPackage } satisfies FreightLine;
}

function equalFractions(
  left: { numerator: bigint; denominator: bigint },
  right: { numerator: bigint; denominator: bigint },
): boolean {
  return left.numerator * right.denominator === right.numerator * left.denominator;
}

const lineArbitrary = fc.record({
  costPaidCents: fc.integer({ min: 0, max: 5_000_000 }),
  quantity: fc.integer({ min: 1, max: 2_000_000 }),
  quantityPerPackage: fc.integer({ min: 1, max: 100_000 }),
});

const linesArbitrary = fc
  .uniqueArray(fc.uuid(), { minLength: 1, maxLength: 8 })
  .chain((ids) => fc.tuple(...ids.map((id) => lineArbitrary.map((fields) => ({ id, ...fields })))))
  .filter((lines) => hasDistributableValue(lines));

const amountArbitrary = fc.integer({ min: 1, max: MAX_CASH_AMOUNT_CENTS });

function exactShare(amount: number, lines: FreightLine[], index: number) {
  const scaled = lines.map((candidate, at) =>
    lines.reduce(
      (weight, other, otherAt) =>
        otherAt === at ? weight : weight * BigInt(other.quantityPerPackage),
      BigInt(candidate.costPaidCents) * BigInt(candidate.quantity),
    ),
  );
  const total = scaled.reduce((sum, weight) => sum + weight, 0n);
  return { numerator: BigInt(amount) * (scaled[index] as bigint), denominator: total };
}

function shareOf(result: { lineId: string; cents: number }[], id: string): number {
  return (result.find(({ lineId }) => lineId === id) as { cents: number }).cents;
}

describe("lineValue", () => {
  it("is the cost paid per package times the packages bought, which is the quantity over the package size", () => {
    expect(
      equalFractions(lineValue(line("a", 1000, 12_000, 12_000)), {
        numerator: 1000n,
        denominator: 1n,
      }),
    ).toBe(true);
    expect(
      equalFractions(lineValue(line("a", 1000, 24_000, 12_000)), {
        numerator: 2000n,
        denominator: 1n,
      }),
    ).toBe(true);
  });

  it("keeps the fraction of a cent of a line loaded by quantity", () => {
    expect(
      equalFractions(lineValue(line("a", 333, 2500, 1000)), { numerator: 1665n, denominator: 2n }),
    ).toBe(true);
  });
});

describe("hasDistributableValue", () => {
  it("is true when some line is worth something", () => {
    expect(hasDistributableValue([line("a", 0), line("b", 1)])).toBe(true);
  });

  it("is false when every line is free or there are no lines", () => {
    expect(hasDistributableValue([line("a", 0), line("b", 0)])).toBe(false);
    expect(hasDistributableValue([])).toBe(false);
  });
});

describe("distributeFreight", () => {
  it("splits a freight in proportion to each line's value", () => {
    expect(distributeFreight(1000, [line("a", 100), line("b", 300)])).toEqual([
      { lineId: "a", cents: 250 },
      { lineId: "b", cents: 750 },
    ]);
  });

  it("gives the leftover cent to the line with the largest fractional remainder", () => {
    expect(distributeFreight(100, [line("a", 1), line("b", 2)])).toEqual([
      { lineId: "a", cents: 33 },
      { lineId: "b", cents: 67 },
    ]);
  });

  it("gives the leftover cent of a tie to the lower line id", () => {
    expect(distributeFreight(100, [line("c", 1), line("a", 1), line("b", 1)])).toEqual([
      { lineId: "a", cents: 34 },
      { lineId: "b", cents: 33 },
      { lineId: "c", cents: 33 },
    ]);
  });

  it("gives a line worth nothing no share", () => {
    expect(distributeFreight(5, [line("a", 0), line("b", 7)])).toEqual([
      { lineId: "a", cents: 0 },
      { lineId: "b", cents: 5 },
    ]);
  });

  it("refuses to distribute when no line is worth anything", () => {
    expect(() => distributeFreight(100, [line("a", 0)])).toThrow();
  });

  it("shares add up to exactly the freight's amount", () => {
    fc.assert(
      fc.property(amountArbitrary, linesArbitrary, (amount, lines) => {
        const total = distributeFreight(amount, lines).reduce((sum, { cents }) => sum + cents, 0);
        expect(total).toBe(amount);
      }),
    );
  });

  it("gives each line the floor of its exact share or one cent more, and never a negative one", () => {
    fc.assert(
      fc.property(amountArbitrary, linesArbitrary, (amount, lines) => {
        const result = distributeFreight(amount, lines);
        expect(result).toHaveLength(lines.length);
        for (const [index, { id }] of lines.entries()) {
          const exact = exactShare(amount, lines, index);
          const floor = exact.numerator / exact.denominator;
          const cents = BigInt(shareOf(result, id));
          expect(cents === floor || cents === floor + 1n).toBe(true);
          expect(cents >= 0n).toBe(true);
        }
      }),
    );
  });

  it("gives the extra cents to the largest remainders", () => {
    fc.assert(
      fc.property(amountArbitrary, linesArbitrary, (amount, lines) => {
        const result = distributeFreight(amount, lines);
        const remainder = (index: number) => {
          const exact = exactShare(amount, lines, index);
          return exact.numerator % exact.denominator;
        };
        const entries = lines.map((candidate, index) => {
          const exact = exactShare(amount, lines, index);
          const raised =
            BigInt(shareOf(result, candidate.id)) > exact.numerator / exact.denominator;
          return {
            id: candidate.id,
            raised,
            remainder: remainder(index),
            denominator: exact.denominator,
          };
        });
        for (const winner of entries.filter(({ raised }) => raised)) {
          for (const loser of entries.filter(({ raised }) => !raised)) {
            expect(
              winner.remainder > loser.remainder ||
                (winner.remainder === loser.remainder && winner.id < loser.id),
            ).toBe(true);
          }
        }
      }),
    );
  });

  it("gives the same result whatever order the lines come in", () => {
    fc.assert(
      fc.property(
        amountArbitrary,
        linesArbitrary.chain((lines) =>
          fc.tuple(fc.constant(lines), fc.shuffledSubarray(lines, { minLength: lines.length })),
        ),
        (amount, [lines, shuffled]) => {
          expect(distributeFreight(amount, shuffled)).toEqual(distributeFreight(amount, lines));
        },
      ),
    );
  });

  it("gives equal lines the leftover cents from the lowest id up", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.uuid(), { minLength: 2, maxLength: 8 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.nat(),
        fc.integer({ min: 1, max: 1_000_000 }),
        (ids, base, leftoverSeed, cost) => {
          const leftover = 1 + (leftoverSeed % (ids.length - 1));
          const amount = base * ids.length + leftover;
          const result = distributeFreight(
            amount,
            ids.map((id) => line(id, cost)),
          );
          const ordered = [...ids].sort();
          for (const [position, id] of ordered.entries()) {
            expect(shareOf(result, id)).toBe(position < leftover ? base + 1 : base);
          }
        },
      ),
    );
  });
});

describe("freightPerUnit", () => {
  it("is the line's share over its quantity in sale units, in cents per unit", () => {
    const freights = [{ amountCents: 1000, lines: [line("a", 100, 4000, 1000), line("b", 300)] }];
    expect(
      equalFractions(freightPerUnit("a", freights), { numerator: 1000n, denominator: 4n }),
    ).toBe(true);
  });

  it("adds the shares from every freight linked to the line's purchase", () => {
    const freights = [
      { amountCents: 1000, lines: [line("a", 100, 2000, 1000), line("b", 300)] },
      { amountCents: 300, lines: [line("a", 100, 2000, 1000)] },
    ];
    expect(
      equalFractions(freightPerUnit("a", freights), { numerator: 550n, denominator: 2n }),
    ).toBe(true);
  });

  it("is zero for a line with no freight", () => {
    expect(equalFractions(freightPerUnit("a", []), { numerator: 0n, denominator: 1n })).toBe(true);
  });

  it("times its quantity gives back the shares the distribution makes", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(amountArbitrary, linesArbitrary), { minLength: 1, maxLength: 3 }),
        (generated) => {
          const target = (generated[0] as [number, FreightLine[]])[1][0] as FreightLine;
          const freights = generated.map(([amountCents, lines]) => ({
            amountCents,
            lines: [target, ...lines.filter(({ id }) => id !== target.id)],
          }));
          const shares = freights.reduce(
            (sum, { amountCents, lines }) =>
              sum + shareOf(distributeFreight(amountCents, lines), target.id),
            0,
          );
          const perUnit = freightPerUnit(target.id, freights);
          expect(perUnit.numerator * BigInt(target.quantity)).toBe(
            BigInt(shares) * 1000n * perUnit.denominator,
          );
        },
      ),
    );
  });
});
