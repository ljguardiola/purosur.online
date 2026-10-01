import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseAmountCents, parseEsArNumber } from "./parsers";

const MAX_POSTGRES_INTEGER = 2_147_483_647;

function typedAmount(cents: number): string {
  const pesos = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${pesos},${String(cents % 100).padStart(2, "0")}`;
}

describe("parseEsArNumber", () => {
  it("splits a comma-separated number into its whole and fraction digits", () => {
    expect(parseEsArNumber("7500,5", 2)).toEqual({ whole: "7500", fraction: "5" });
    expect(parseEsArNumber("7500", 2)).toEqual({ whole: "7500", fraction: "" });
  });

  it("drops the dots of valid 3-digit thousands groups", () => {
    expect(parseEsArNumber("1.000", 2)).toEqual({ whole: "1000", fraction: "" });
    expect(parseEsArNumber("12.345,67", 2)).toEqual({ whole: "12345", fraction: "67" });
    expect(parseEsArNumber("1.000.000", 2)).toEqual({ whole: "1000000", fraction: "" });
  });

  it("rejects a dot that is not a valid thousands group", () => {
    for (const value of ["1.5", "1.00", "1.0000", "1..000", ".5", "1.000.00", "1000.000"]) {
      expect(parseEsArNumber(value, 2), value).toBeUndefined();
    }
  });

  it("rejects a first thousands group that starts with a zero", () => {
    for (const value of ["0.500", "00.500", "000.001", "0.000,50", "01.000"]) {
      expect(parseEsArNumber(value, 2), value).toBeUndefined();
    }
  });

  it("reads leading zeros without a thousands dot as the plain number they spell", () => {
    expect(parseEsArNumber("007", 2)).toEqual({ whole: "007", fraction: "" });
    expect(parseEsArNumber("0,50", 2)).toEqual({ whole: "0", fraction: "50" });
  });

  it("allows at most the given number of decimals", () => {
    expect(parseEsArNumber("1,25", 2)).toEqual({ whole: "1", fraction: "25" });
    expect(parseEsArNumber("1,255", 2)).toBeUndefined();
    expect(parseEsArNumber("1,255", 3)).toEqual({ whole: "1", fraction: "255" });
    expect(parseEsArNumber("1,2555", 3)).toBeUndefined();
  });

  it("reads whole numbers only when no decimals are allowed", () => {
    expect(parseEsArNumber("1.250", 0)).toEqual({ whole: "1250", fraction: "" });
    expect(parseEsArNumber("1,5", 0)).toBeUndefined();
  });

  it("rejects a comma with no digits on either side of it", () => {
    expect(parseEsArNumber("1,", 2)).toBeUndefined();
    expect(parseEsArNumber(",5", 2)).toBeUndefined();
  });

  it("rejects signs, letters, inner spaces and a second comma", () => {
    for (const value of ["-1", "+1", "abc", "1,2,3", "1 000", ""]) {
      expect(parseEsArNumber(value, 2), value).toBeUndefined();
    }
  });

  it("trims surrounding spaces", () => {
    expect(parseEsArNumber("  1.000,5  ", 2)).toEqual({ whole: "1000", fraction: "5" });
  });
});

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
