import { describe, expect, it } from "vitest";
import { MAX_STOCK_QUANTITY } from "../../stock/index.js";
import { pricedWeighingStep } from "./priced-weighing-step.js";

const amountAt = (weightThousandths: number) => weightThousandths * 9;

describe("pricedWeighingStep", () => {
  it("shows a stable weight with its amount", () => {
    expect(pricedWeighingStep({ kind: "stable", weightThousandths: 1250 }, null, amountAt)).toEqual(
      { kind: "stable", weightThousandths: 1250, amount: 11250 },
    );
  });

  it("shows a stable zero with a zero amount", () => {
    expect(pricedWeighingStep({ kind: "stable", weightThousandths: 0 }, null, () => 1)).toEqual({
      kind: "stable",
      weightThousandths: 0,
      amount: 0,
    });
  });

  it("refuses to take a stable zero", () => {
    expect(pricedWeighingStep({ kind: "stable", weightThousandths: 0 }, 0, amountAt)).toEqual({
      kind: "zero_weight",
    });
  });

  it.each([1.5, MAX_STOCK_QUANTITY + 1])(
    "keeps weighing for a stable reading of %s thousandths that is no line weight",
    (weightThousandths) => {
      expect(
        pricedWeighingStep({ kind: "stable", weightThousandths }, weightThousandths, amountAt),
      ).toEqual({ kind: "weighing" });
    },
  );

  it("takes the largest line weight when it is the one being confirmed", () => {
    expect(
      pricedWeighingStep(
        { kind: "stable", weightThousandths: MAX_STOCK_QUANTITY },
        MAX_STOCK_QUANTITY,
        amountAt,
      ),
    ).toEqual({ kind: "take", weightThousandths: MAX_STOCK_QUANTITY });
  });

  it.each([null, 1250])("shows an unstable weight with its amount, confirming %s", (confirmed) => {
    expect(
      pricedWeighingStep({ kind: "unstable", weightThousandths: 1250 }, confirmed, amountAt),
    ).toEqual({ kind: "unsteady", weightThousandths: 1250, amount: 11250 });
  });

  it.each([0, -120, 1.5, MAX_STOCK_QUANTITY + 1])(
    "keeps weighing for an unstable reading of %s thousandths that is no line weight",
    (weightThousandths) => {
      expect(pricedWeighingStep({ kind: "unstable", weightThousandths }, null, amountAt)).toEqual({
        kind: "weighing",
      });
    },
  );
});
