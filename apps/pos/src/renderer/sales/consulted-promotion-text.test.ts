import { describe, expect, it } from "vitest";
import { consultedPromotionText } from "./consulted-promotion-text";

describe("consultedPromotionText", () => {
  it.each([
    [{ kind: "PERCENT_OFF", percent: 10 }, [], "10 % de descuento"],
    [{ kind: "PERCENT_OFF", percent: 10 }, [2], "10 % los martes"],
    [{ kind: "PERCENT_OFF", percent: 15 }, [2, 4], "15 % los martes y jueves"],
    [{ kind: "BUY_N_PAY_M", buy_qty: 3, pay_qty: 2 }, [], "Lleve 3, pague 2"],
    [{ kind: "BUY_N_PAY_M", buy_qty: 3, pay_qty: 2 }, [6], "Lleve 3, pague 2 los sábados"],
  ] as const)("reads %j on weekdays %j as %s", (benefit, weekdays, text) => {
    expect(consultedPromotionText({ benefit, weekdays })).toBe(text);
  });
});
