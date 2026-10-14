import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isPointTerminalId, normalizePointTerminalId } from "./point-terminal-id.js";

describe("isPointTerminalId", () => {
  it.each(["PAX_A910__SMARTPOS1234567890", "a", "NEWLAND_N950__N950NCB801293324"])(
    "accepts %s",
    (id) => {
      expect(isPointTerminalId(id)).toBe(true);
    },
  );

  it.each(["", " ", "ABC DEF", " ABC", "ABC ", "ABC\tDEF", "ABC\nDEF", "ABC\u00a0DEF"])(
    "refuses %j",
    (id) => {
      expect(isPointTerminalId(id)).toBe(false);
    },
  );

  it("accepts any non-empty text without whitespace, however long", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 300 }).filter((text) => !/\s/u.test(text)),
        (id) => isPointTerminalId(id),
      ),
    );
  });

  it("refuses any text holding whitespace", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.constantFrom(" ", "\t", "\n", " "),
        fc.string(),
        (before, space, after) => !isPointTerminalId(`${before}${space}${after}`),
      ),
    );
  });
});

describe("normalizePointTerminalId", () => {
  it("drops the whitespace around a terminal id", () => {
    expect(normalizePointTerminalId("  PAX_A910__SMARTPOS1234567890\n")).toBe(
      "PAX_A910__SMARTPOS1234567890",
    );
  });

  it("keeps an id that is already clean", () => {
    expect(normalizePointTerminalId("PAX_A910__SMARTPOS1234567890")).toBe(
      "PAX_A910__SMARTPOS1234567890",
    );
  });

  it.each(["", "   ", "ABC DEF"])("answers nothing for %j", (raw) => {
    expect(normalizePointTerminalId(raw)).toBeNull();
  });
});
