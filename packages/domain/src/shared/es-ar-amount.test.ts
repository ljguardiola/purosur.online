import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseAmountCents } from "./es-ar-amount.js";

const MAX_POSTGRES_INTEGER = 2_147_483_647;

function typedAmount(cents: number): string {
  const pesos = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${pesos},${String(cents % 100).padStart(2, "0")}`;
}

describe("parseAmountCents", () => {
  it("reads a comma as the decimal separator and a dot only as a thousands separator", () => {
    const accepted: [string, number][] = [
      ["7.500,50", 750050],
      ["7500,5", 750050],
      ["12,50", 1250],
      ["0,01", 1],
      ["1.250", 125000],
      ["1.234.567", 123456700],
      ["8000", 800000],
      ["  8000  ", 800000],
    ];
    for (const [typed, cents] of accepted) {
      expect(parseAmountCents(typed), typed).toBe(cents);
    }
  });

  it("reads leading zeros without a thousands dot as the plain amount they spell", () => {
    expect(parseAmountCents("007")).toBe(700);
    expect(parseAmountCents("007,50")).toBe(750);
  });

  it("rejects a dot used as a decimal separator or a malformed group", () => {
    for (const typed of ["12.50", "1.5", "7500.50", "1.50,00", "1..000", ".5", "1,", "abc", "-5"]) {
      expect(parseAmountCents(typed), typed).toBeUndefined();
    }
  });

  it("rejects more than two decimals", () => {
    expect(parseAmountCents("12,505")).toBeUndefined();
  });

  it("rejects a first thousands group that starts with a zero", () => {
    for (const typed of ["0.500", "00.500", "000.001", "0.000,50"]) {
      expect(parseAmountCents(typed), typed).toBeUndefined();
    }
  });

  it("reads amounts outside the storable range as the cents they spell, leaving the range to the caller", () => {
    expect(parseAmountCents("0")).toBe(0);
    expect(parseAmountCents("0,00")).toBe(0);
    expect(parseAmountCents("21.474.836,48")).toBe(MAX_POSTGRES_INTEGER + 1);
    expect(parseAmountCents("999.999.999.999")).toBe(99_999_999_999_900);
  });

  it("reads back every formatted amount as the cents it was formatted from", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_POSTGRES_INTEGER }), (cents) => {
        expect(parseAmountCents(typedAmount(cents))).toBe(cents);
      }),
    );
  });

  it("rejects any amount whose first thousands group starts with a zero", () => {
    const tail = fc.array(fc.integer({ min: 0, max: 999 }), { minLength: 1, maxLength: 3 });
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 99 }),
        fc.integer({ min: 0, max: 2 }),
        tail,
        fc.option(fc.integer({ min: 0, max: 99 }), { nil: undefined }),
        (head, padding, groups, fraction) => {
          const firstGroup = `0${String(head).padStart(padding, "0")}`;
          const whole = [firstGroup, ...groups.map((group) => String(group).padStart(3, "0"))];
          const typed = `${whole.join(".")}${fraction === undefined ? "" : `,${fraction}`}`;
          expect(parseAmountCents(typed), typed).toBeUndefined();
        },
      ),
    );
  });
});
