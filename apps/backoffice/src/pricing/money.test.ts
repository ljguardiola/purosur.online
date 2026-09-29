import { describe, expect, it } from "vitest";
import { formatCents, MAX_UNIT_PRICE_CENTS, parseAmountCents } from "./money";

/** A small seeded generator (mulberry32), so every run checks the same generated cases. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

const GENERATED_CASES = 2000;

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

  it("reads amounts outside the storable range as the cents they spell, leaving the range to the request's schema", () => {
    expect(parseAmountCents("0")).toBe(0);
    expect(parseAmountCents("0,00")).toBe(0);
    expect(parseAmountCents("21.474.836,48")).toBe(MAX_UNIT_PRICE_CENTS + 1);
    expect(parseAmountCents("999.999.999.999")).toBe(99_999_999_999_900);
  });

  it("reads back every formatted amount as the cents it was formatted from", () => {
    const random = seededRandom(20260926);
    for (let i = 0; i < GENERATED_CASES; i += 1) {
      const cents = randomInt(random, 1, MAX_UNIT_PRICE_CENTS);
      const typed = formatCents(cents).replace(/^\$ /, "");
      expect(parseAmountCents(typed), typed).toBe(cents);
    }
  });

  it("rejects any amount whose first thousands group starts with a zero", () => {
    const random = seededRandom(20260927);
    for (let i = 0; i < GENERATED_CASES; i += 1) {
      const firstGroup = `0${String(randomInt(random, 0, 99)).padStart(randomInt(random, 0, 2), "0")}`;
      const groups = Array.from({ length: randomInt(random, 1, 3) }, () =>
        String(randomInt(random, 0, 999)).padStart(3, "0"),
      );
      const fraction = random() < 0.5 ? "" : `,${randomInt(random, 0, 99)}`;
      const typed = `${[firstGroup, ...groups].join(".")}${fraction}`;
      expect(parseAmountCents(typed), typed).toBeUndefined();
    }
  });
});

describe("formatCents", () => {
  it("formats cents as pesos with a dot for thousands and two decimals after a comma", () => {
    expect(formatCents(750050)).toBe("$ 7.500,50");
    expect(formatCents(1)).toBe("$ 0,01");
    expect(formatCents(MAX_UNIT_PRICE_CENTS)).toBe("$ 21.474.836,47");
  });
});
