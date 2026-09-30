import { describe, expect, it } from "vitest";
import { countedCashFrom, differenceNotice, differenceText, signedAmount } from "./cash-amounts";

describe("signedAmount", () => {
  it("puts the direction before the amount, with a proper minus sign", () => {
    expect(signedAmount("+", 5_070_000)).toBe("+ $ 50.700,00");
    expect(signedAmount("−", 930_000)).toBe("− $ 9.300,00");
  });
});

describe("countedCashFrom", () => {
  it("reads a typed amount as cents", () => {
    expect(countedCashFrom("31.500,50")).toEqual({ cents: 3_150_050 });
  });

  it("asks for the counted cash when nothing was typed", () => {
    expect(countedCashFrom("  ")).toEqual({ message: "Ingresá el efectivo contado." });
  });

  it("asks for a valid amount when what was typed is not one", () => {
    const invalid = { message: "Ingresá un importe válido, por ejemplo 31.500,00." };

    expect(countedCashFrom("abc")).toEqual(invalid);
    expect(countedCashFrom("-5")).toEqual(invalid);
  });
});

describe("differenceText", () => {
  it("signs a difference, and leaves a zero difference plain", () => {
    expect(differenceText(-40_000)).toBe("− $ 400,00");
    expect(differenceText(40_000)).toBe("+ $ 400,00");
    expect(differenceText(0)).toBe("$ 0,00");
  });
});

describe("differenceNotice", () => {
  it("says how much cash is missing or left over, and that it does not stop the close", () => {
    expect(differenceNotice(-40_000)).toBe(
      "Faltan $ 400,00. La diferencia se registra con la sesión y no impide cerrarla.",
    );
    expect(differenceNotice(40_000)).toBe(
      "Sobran $ 400,00. La diferencia se registra con la sesión y no impide cerrarla.",
    );
  });

  it("has nothing to say when the count matches", () => {
    expect(differenceNotice(0)).toBeUndefined();
  });
});
