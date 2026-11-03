import { describe, expect, it } from "vitest";
import { MAX_STOCK_QUANTITY } from "../../stock/index.js";
import { scaleWeighingStep } from "./scale-weighing-step.js";

const amountAt = (weightThousandths: number) => weightThousandths * 9;

describe("scaleWeighingStep", () => {
  it.each([null, 1250])(
    "says the scale is unavailable when it cannot be read, confirming %s",
    (confirmed) => {
      expect(scaleWeighingStep({ kind: "unavailable" }, confirmed, amountAt)).toEqual({
        kind: "scale_unavailable",
      });
    },
  );

  it.each([null, 1250])("keeps weighing while the plate moves, confirming %s", (confirmed) => {
    expect(scaleWeighingStep({ kind: "not_stable" }, confirmed, amountAt)).toEqual({
      kind: "weighing",
    });
  });

  it("shows a stable weight and its amount when nothing is being confirmed", () => {
    expect(scaleWeighingStep({ kind: "stable", weightThousandths: 1250 }, null, amountAt)).toEqual({
      kind: "stable",
      weightThousandths: 1250,
      amount: 11250,
    });
  });

  it("shows a stable zero with a zero amount when nothing is being confirmed", () => {
    expect(scaleWeighingStep({ kind: "stable", weightThousandths: 0 }, null, amountAt)).toEqual({
      kind: "stable",
      weightThousandths: 0,
      amount: 0,
    });
  });

  it.each([0, 1250])("refuses to take a stable zero confirming %s", (confirmed) => {
    expect(
      scaleWeighingStep({ kind: "stable", weightThousandths: 0 }, confirmed, amountAt),
    ).toEqual({ kind: "zero_weight" });
  });

  it.each([
    [-1, null],
    [1.5, null],
    [MAX_STOCK_QUANTITY + 1, null],
    [-1, -1],
    [1.5, 1.5],
    [MAX_STOCK_QUANTITY + 1, MAX_STOCK_QUANTITY + 1],
  ])(
    "keeps weighing for a stable reading of %s thousandths that is no line weight, confirming %s",
    (weightThousandths, confirmed) => {
      expect(scaleWeighingStep({ kind: "stable", weightThousandths }, confirmed, amountAt)).toEqual(
        { kind: "weighing" },
      );
    },
  );

  it("takes a stable reading equal to the weight being confirmed", () => {
    expect(scaleWeighingStep({ kind: "stable", weightThousandths: 1250 }, 1250, amountAt)).toEqual({
      kind: "take",
      weightThousandths: 1250,
    });
  });

  it("shows a stable reading other than the weight being confirmed instead of taking it", () => {
    expect(scaleWeighingStep({ kind: "stable", weightThousandths: 2500 }, 1250, amountAt)).toEqual({
      kind: "stable",
      weightThousandths: 2500,
      amount: 22500,
    });
  });

  it("takes the largest line weight when it is the one being confirmed", () => {
    expect(
      scaleWeighingStep(
        { kind: "stable", weightThousandths: MAX_STOCK_QUANTITY },
        MAX_STOCK_QUANTITY,
        amountAt,
      ),
    ).toEqual({ kind: "take", weightThousandths: MAX_STOCK_QUANTITY });
  });
});
