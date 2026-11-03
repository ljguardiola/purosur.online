import { describe, expect, it } from "vitest";
import { scaleWeighingStep } from "./scale-weighing.js";

const UP_TO_5000 = (weightThousandths: number) =>
  weightThousandths > 0 && weightThousandths <= 5000;

describe("scaleWeighingStep", () => {
  it.each([null, 1250])(
    "says the scale is unavailable when it cannot be read, confirming %s",
    (confirmed) => {
      expect(scaleWeighingStep({ kind: "unavailable" }, confirmed, UP_TO_5000)).toEqual({
        kind: "scale_unavailable",
      });
    },
  );

  it.each([null, 1250])("keeps weighing while the plate moves, confirming %s", (confirmed) => {
    expect(scaleWeighingStep({ kind: "not_stable" }, confirmed, UP_TO_5000)).toEqual({
      kind: "weighing",
    });
  });

  it("shows a stable weight when nothing is being confirmed", () => {
    expect(
      scaleWeighingStep({ kind: "stable", weightThousandths: 1250 }, null, UP_TO_5000),
    ).toEqual({ kind: "stable", weightThousandths: 1250 });
  });

  it("shows a stable zero when nothing is being confirmed", () => {
    expect(scaleWeighingStep({ kind: "stable", weightThousandths: 0 }, null, UP_TO_5000)).toEqual({
      kind: "stable",
      weightThousandths: 0,
    });
  });

  it.each([0, 1250])("refuses to take a stable zero confirming %s", (confirmed) => {
    expect(
      scaleWeighingStep({ kind: "stable", weightThousandths: 0 }, confirmed, UP_TO_5000),
    ).toEqual({ kind: "zero_weight" });
  });

  it.each([
    [5001, null],
    [5001, 5001],
    [-1, -1],
  ])(
    "keeps weighing for a stable reading of %s thousandths that is no quantity, confirming %s",
    (weightThousandths, confirmed) => {
      expect(
        scaleWeighingStep({ kind: "stable", weightThousandths }, confirmed, UP_TO_5000),
      ).toEqual({ kind: "weighing" });
    },
  );

  it("takes a stable reading equal to the weight being confirmed", () => {
    expect(
      scaleWeighingStep({ kind: "stable", weightThousandths: 1250 }, 1250, UP_TO_5000),
    ).toEqual({ kind: "take", weightThousandths: 1250 });
  });

  it("shows a stable reading other than the weight being confirmed instead of taking it", () => {
    expect(
      scaleWeighingStep({ kind: "stable", weightThousandths: 2500 }, 1250, UP_TO_5000),
    ).toEqual({ kind: "stable", weightThousandths: 2500 });
  });

  it("takes the largest quantity when it is the weight being confirmed", () => {
    expect(
      scaleWeighingStep({ kind: "stable", weightThousandths: 5000 }, 5000, UP_TO_5000),
    ).toEqual({ kind: "take", weightThousandths: 5000 });
  });
});
