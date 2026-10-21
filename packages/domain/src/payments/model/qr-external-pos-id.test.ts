import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isQrExternalPosId, normalizeQrExternalPosId } from "./qr-external-pos-id.js";

describe("isQrExternalPosId", () => {
  it.each(["CAJA1_STORE_POS", "a", "SUCURSAL01CAJA02"])("accepts %s", (id) => {
    expect(isQrExternalPosId(id)).toBe(true);
  });

  it.each(["", " ", "CAJA 1", " CAJA1", "CAJA1 ", "CAJA\t1", "CAJA\n1", "CAJA 1"])(
    "refuses %j",
    (id) => {
      expect(isQrExternalPosId(id)).toBe(false);
    },
  );

  it("accepts any non-empty text without whitespace, however long", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 300 }).filter((text) => !/\s/u.test(text)),
        (id) => isQrExternalPosId(id),
      ),
    );
  });

  it("refuses any text holding whitespace", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.constantFrom(" ", "\t", "\n", " "),
        fc.string(),
        (before, space, after) => !isQrExternalPosId(`${before}${space}${after}`),
      ),
    );
  });
});

describe("normalizeQrExternalPosId", () => {
  it("drops the whitespace around an external point of sale id", () => {
    expect(normalizeQrExternalPosId("  CAJA1_STORE_POS\n")).toBe("CAJA1_STORE_POS");
  });

  it("keeps an id that is already clean", () => {
    expect(normalizeQrExternalPosId("CAJA1_STORE_POS")).toBe("CAJA1_STORE_POS");
  });

  it.each(["", "   ", "CAJA 1"])("answers nothing for %j", (raw) => {
    expect(normalizeQrExternalPosId(raw)).toBeNull();
  });
});
