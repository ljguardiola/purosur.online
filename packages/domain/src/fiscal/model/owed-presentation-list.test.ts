import { describe, expect, it } from "vitest";
import {
  type ListedOwedPresentation,
  listsOwedPresentation,
  splitOwedPresentations,
} from "./owed-presentation-list.js";

const FIRST_HALF = { start: "2026-09-01", end: "2026-09-15" };
const SECOND_HALF = { start: "2026-09-16", end: "2026-09-30" };

function listed(pointOfSaleNumber: number, fortnight = FIRST_HALF): ListedOwedPresentation {
  return { pointOfSaleNumber, fortnight };
}

describe("splitOwedPresentations", () => {
  it("keeps the entries of owned points of sale apart from the ones owed elsewhere, in the list's order", () => {
    const list = [listed(3), listed(9, SECOND_HALF), listed(4, SECOND_HALF), listed(8)];

    expect(splitOwedPresentations(list, [3, 4])).toEqual({
      owned: [listed(3), listed(4, SECOND_HALF)],
      owedElsewhere: [listed(9, SECOND_HALF), listed(8)],
    });
  });

  it("owes nothing elsewhere when every point of sale is owned, and nothing owned when none is", () => {
    const list = [listed(3), listed(4)];

    expect(splitOwedPresentations(list, [3, 4])).toEqual({ owned: list, owedElsewhere: [] });
    expect(splitOwedPresentations(list, [])).toEqual({ owned: [], owedElsewhere: list });
  });

  it("splits an empty list into two empty ones", () => {
    expect(splitOwedPresentations([], [3])).toEqual({ owned: [], owedElsewhere: [] });
  });
});

describe("listsOwedPresentation", () => {
  it("lists a presentation of the same point of sale and fortnight", () => {
    expect(listsOwedPresentation([listed(3), listed(4)], listed(4, { ...FIRST_HALF }))).toBe(true);
  });

  it("does not list another point of sale or another fortnight", () => {
    expect(listsOwedPresentation([listed(3)], listed(4))).toBe(false);
    expect(listsOwedPresentation([listed(3)], listed(3, SECOND_HALF))).toBe(false);
    expect(listsOwedPresentation([], listed(3))).toBe(false);
  });
});
