import { describe, expect, it } from "vitest";
import { isSameProposalItem, isSameProposalRow } from "./proposal-asked-from.js";

const ITEM = {
  description: "Aceite de palta 250 ml",
  presentation: "x3 packs",
  otherPresentations: ["Caja", "Pack x12u"],
};
const ROW = { ...ITEM, barcode: "7790001000012" };

describe("isSameProposalItem", () => {
  it("is the same item with the same text and other presentations", () => {
    expect(isSameProposalItem(ITEM, { ...ITEM, otherPresentations: ["Caja", "Pack x12u"] })).toBe(
      true,
    );
  });

  it("is the same item with its other presentations in another order", () => {
    expect(isSameProposalItem(ITEM, { ...ITEM, otherPresentations: ["Pack x12u", "Caja"] })).toBe(
      true,
    );
  });

  it.each([
    ["description", { ...ITEM, description: "Aceite de palta 500 ml" }],
    ["presentation", { ...ITEM, presentation: "x6 packs" }],
    ["presentation now absent", { ...ITEM, presentation: null }],
    [
      "other presentations, one more",
      { ...ITEM, otherPresentations: ["Caja", "Pack x12u", "Bulto"] },
    ],
    ["other presentations, one fewer", { ...ITEM, otherPresentations: ["Caja"] }],
    ["other presentations, one replaced", { ...ITEM, otherPresentations: ["Caja", "Bulto"] }],
  ])("is another item with another %s", (_name, other) => {
    expect(isSameProposalItem(ITEM, other)).toBe(false);
  });
});

describe("isSameProposalRow", () => {
  it("is the same row with the same item and barcode", () => {
    expect(isSameProposalRow(ROW, { ...ROW })).toBe(true);
  });

  it.each([
    ["barcode", { ...ROW, barcode: "7790001000029" }],
    ["barcode now absent", { ...ROW, barcode: null }],
    ["description", { ...ROW, description: "Aceite de oliva 250 ml" }],
  ])("is another row with another %s", (_name, other) => {
    expect(isSameProposalRow(ROW, other)).toBe(false);
  });
});
