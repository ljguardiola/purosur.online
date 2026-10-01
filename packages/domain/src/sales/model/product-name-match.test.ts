import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { matchProductName } from "./product-name-match.js";

describe("matchProductName", () => {
  it("matches the start of a name's word and returns where it sits in the name", () => {
    expect(matchProductName("Té verde", "ver")).toEqual([{ start: 3, length: 3 }]);
  });

  it("ignores case and accents in both the query and the name", () => {
    expect(matchProductName("Té verde", "TE")).toEqual([{ start: 0, length: 2 }]);
    expect(matchProductName("Te verde", "té")).toEqual([{ start: 0, length: 2 }]);
    expect(matchProductName("ÑOQUIS", "ñoq")).toEqual([{ start: 0, length: 3 }]);
    expect(matchProductName("Ñoquis", "noq")).toEqual([{ start: 0, length: 3 }]);
  });

  it("covers the whole accented letter when the name is written with combining marks", () => {
    expect(matchProductName("Café molido", "cafe")).toEqual([{ start: 0, length: 5 }]);
  });

  it("matches by any word of the name", () => {
    expect(matchProductName("Yerba mate suave", "suave")).toEqual([{ start: 11, length: 5 }]);
  });

  it("does not match from the middle of a word", () => {
    expect(matchProductName("Yerba mate", "erba")).toBeUndefined();
  });

  it("does not match a query longer than the word", () => {
    expect(matchProductName("Té", "tea")).toBeUndefined();
  });

  it("requires every query word to start some word of the name, in any order", () => {
    expect(matchProductName("Yerba mate suave", "su ye")).toEqual([
      { start: 0, length: 2 },
      { start: 11, length: 2 },
    ]);
    expect(matchProductName("Yerba mate suave", "ye xx")).toBeUndefined();
  });

  it("splits the name and the query on anything that is not a letter or a digit", () => {
    expect(matchProductName("Yerba-mate 1/2 kg", "mate")).toEqual([{ start: 6, length: 4 }]);
    expect(matchProductName("Yerba-mate 1/2 kg", "2 kg")).toEqual([
      { start: 13, length: 1 },
      { start: 15, length: 2 },
    ]);
    expect(matchProductName("Yerba mate", "  yer,  ")).toEqual([{ start: 0, length: 3 }]);
  });

  it("matches digits as part of words", () => {
    expect(matchProductName("Coca 2250 cc", "22")).toEqual([{ start: 5, length: 2 }]);
  });

  it("highlights the longest match when several query words start the same word", () => {
    expect(matchProductName("Yerba mate", "ye yerb")).toEqual([{ start: 0, length: 4 }]);
  });

  it("matches nothing for a query without words", () => {
    expect(matchProductName("Yerba mate", "")).toBeUndefined();
    expect(matchProductName("Yerba mate", "   ")).toBeUndefined();
    expect(matchProductName("Yerba mate", "-/")).toBeUndefined();
  });

  it("matches nothing for a query made only of combining marks", () => {
    expect(matchProductName("Yerba mate", "\u0301")).toBeUndefined();
    expect(matchProductName("Yerba mate", "\u0301 \u0300")).toBeUndefined();
  });

  it("folds case by lowercasing, so a dotless i is not an i", () => {
    expect(matchProductName("\u0131kea", "i")).toBeUndefined();
    expect(matchProductName("IKEA", "i")).toEqual([{ start: 0, length: 1 }]);
  });

  it("matches nothing for a name without words", () => {
    expect(matchProductName("---", "a")).toBeUndefined();
  });

  it("returns ranges inside the name, in order and without overlapping, for every name and query", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), fc.string({ unit: "binary" }), (name, query) => {
        const ranges = matchProductName(name, query) ?? [];

        let previousEnd = 0;
        for (const { start, length } of ranges) {
          expect(length).toBeGreaterThan(0);
          expect(start).toBeGreaterThanOrEqual(previousEnd);
          previousEnd = start + length;
        }
        expect(previousEnd).toBeLessThanOrEqual(name.length);
      }),
    );
  });

  it("finds every name by the start of each of its words, whatever the case", () => {
    const word = fc.stringMatching(/^[a-z0-9]{1,8}$/);
    fc.assert(
      fc.property(
        fc.array(word, { minLength: 1, maxLength: 4 }),
        fc.nat(),
        fc.boolean(),
        (words, pick, upper) => {
          const name = words.join(" ");
          const chosen = words[pick % words.length] ?? "";
          const query = upper ? chosen.toUpperCase() : chosen;

          expect(matchProductName(name, query)).toBeDefined();
        },
      ),
    );
  });

  it("never matches when a query word starts none of the name's words", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z ]{0,20}$/), (name) => {
        expect(matchProductName(name, "9")).toBeUndefined();
      }),
    );
  });
});
