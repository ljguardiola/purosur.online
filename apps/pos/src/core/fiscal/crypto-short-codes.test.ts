import { randomShortCode } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { cryptoShortCodes } from "./crypto-short-codes";

describe("the register's short code randomness", () => {
  it("draws whole numbers from zero up to the bound, never reaching it, and reaches each of them", () => {
    const bound = 4;

    const draws = Array.from({ length: 400 }, () => cryptoShortCodes.nextIndex(bound));

    expect(draws.every((draw) => Number.isInteger(draw) && draw >= 0 && draw < bound)).toBe(true);
    expect(new Set(draws)).toEqual(new Set([0, 1, 2, 3]));
  });

  it("builds a different short code of the domain's alphabet each time", () => {
    const codes = Array.from({ length: 20 }, () =>
      randomShortCode((bound) => cryptoShortCodes.nextIndex(bound)),
    );

    for (const code of codes) {
      expect(code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
    }
    expect(new Set(codes).size).toBe(20);
  });
});
