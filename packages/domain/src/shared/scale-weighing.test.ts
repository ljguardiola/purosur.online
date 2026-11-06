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

  it.each([null, 1250, 800])(
    "shows an unstable weight as unsteady, never taking it, confirming %s",
    (confirmed) => {
      expect(
        scaleWeighingStep({ kind: "unstable", weightThousandths: 800 }, confirmed, UP_TO_5000),
      ).toEqual({ kind: "unsteady", weightThousandths: 800 });
    },
  );

  it.each([null, 0, 1250])("shows an unstable zero as unsteady, confirming %s", (confirmed) => {
    expect(
      scaleWeighingStep({ kind: "unstable", weightThousandths: 0 }, confirmed, UP_TO_5000),
    ).toEqual({ kind: "unsteady", weightThousandths: 0 });
  });

  it.each([
    [5001, null],
    [5001, 5001],
    [-120, null],
    [-120, -120],
  ])(
    "answers an unstable reading of %s thousandths that is no quantity as out of range, confirming %s",
    (weightThousandths, confirmed) => {
      expect(
        scaleWeighingStep({ kind: "unstable", weightThousandths }, confirmed, UP_TO_5000),
      ).toEqual({ kind: "unsteady_out_of_range" });
    },
  );

  it.each([null, 1250, 2500])(
    "shows a held stable weight as stable, never taking it, confirming %s",
    (confirmed) => {
      expect(
        scaleWeighingStep({ kind: "held_stable", weightThousandths: 1250 }, confirmed, UP_TO_5000),
      ).toEqual({ kind: "stable", weightThousandths: 1250 });
    },
  );

  it("shows a held stable zero when nothing is being confirmed", () => {
    expect(
      scaleWeighingStep({ kind: "held_stable", weightThousandths: 0 }, null, UP_TO_5000),
    ).toEqual({ kind: "stable", weightThousandths: 0 });
  });

  it("refuses to take a held stable zero while confirming", () => {
    expect(
      scaleWeighingStep({ kind: "held_stable", weightThousandths: 0 }, 1250, UP_TO_5000),
    ).toEqual({ kind: "zero_weight" });
  });

  it("keeps weighing for a held stable weight that is no quantity", () => {
    expect(
      scaleWeighingStep({ kind: "held_stable", weightThousandths: 5001 }, 5001, UP_TO_5000),
    ).toEqual({ kind: "weighing" });
  });

  it("takes the confirmed weight only once the scale itself marks it stable after holding it", () => {
    expect(
      scaleWeighingStep({ kind: "held_stable", weightThousandths: 1250 }, 1250, UP_TO_5000),
    ).toEqual({ kind: "stable", weightThousandths: 1250 });
    expect(
      scaleWeighingStep({ kind: "stable", weightThousandths: 1250 }, 1250, UP_TO_5000),
    ).toEqual({ kind: "take", weightThousandths: 1250 });
  });

  it("takes a stable reading equal to the confirmed weight after an unstable one", () => {
    expect(
      scaleWeighingStep({ kind: "unstable", weightThousandths: 1250 }, 1250, UP_TO_5000),
    ).toEqual({ kind: "unsteady", weightThousandths: 1250 });
    expect(
      scaleWeighingStep({ kind: "stable", weightThousandths: 1250 }, 1250, UP_TO_5000),
    ).toEqual({ kind: "take", weightThousandths: 1250 });
  });
});
