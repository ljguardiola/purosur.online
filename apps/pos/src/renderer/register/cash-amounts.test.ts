import { describe, expect, it } from "vitest";
import {
  closedDifferenceText,
  countDifferenceFigure,
  differenceNotice,
  differenceText,
  directedAmount,
  signedAmount,
} from "./cash-amounts";

describe("signedAmount", () => {
  it("puts the direction before the amount, with a proper minus sign", () => {
    expect(signedAmount("+", 5_070_000)).toBe("+ $ 50.700,00");
    expect(signedAmount("−", 930_000)).toBe("− $ 9.300,00");
  });
});

describe("directedAmount", () => {
  it("leaves an amount that adds cash plain and puts a dash before one that takes cash out", () => {
    expect(directedAmount({ amount: 5_070_000, direction: "in" })).toBe("$ 50.700,00");
    expect(directedAmount({ amount: 930_000, direction: "out" })).toBe("\u2013 $ 9.300,00");
  });

  it("leaves an amount that moves no cash plain", () => {
    expect(directedAmount({ amount: 930_000, direction: "none" })).toBe("$ 9.300,00");
  });

  it("keeps the dash of a zero amount that takes cash out", () => {
    expect(directedAmount({ amount: 0, direction: "in" })).toBe("$ 0,00");
    expect(directedAmount({ amount: 0, direction: "out" })).toBe("\u2013 $ 0,00");
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

describe("countDifferenceFigure", () => {
  it("labels missing cash FALTA with the amount missing", () => {
    expect(countDifferenceFigure(-20_000)).toEqual({ label: "FALTA", value: "$ 200,00" });
  });

  it("labels surplus cash SOBRAN with the amount left over", () => {
    expect(countDifferenceFigure(20_000)).toEqual({ label: "SOBRAN", value: "$ 200,00" });
  });

  it("gives no figure when the count matches", () => {
    expect(countDifferenceFigure(0)).toBeUndefined();
  });
});

describe("closedDifferenceText", () => {
  it("puts an en dash before missing cash and a plus before surplus cash", () => {
    expect(closedDifferenceText(-20_000)).toBe("\u2013 $ 200,00");
    expect(closedDifferenceText(20_000)).toBe("+ $ 200,00");
  });

  it("leaves a zero difference plain", () => {
    expect(closedDifferenceText(0)).toBe("$ 0,00");
  });
});
