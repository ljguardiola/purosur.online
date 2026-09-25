import { describe, expect, it } from "vitest";
import {
  LABEL_HEIGHT_MM,
  LABEL_WIDTH_MM,
  LABELS_PER_PAGE,
  layoutLabelSheet,
} from "./label-sheet-layout.js";

describe("layoutLabelSheet", () => {
  it("produces no pages for an empty item list", () => {
    expect(layoutLabelSheet([])).toEqual([]);
  });

  it("places a single label at the sheet's top-left corner", () => {
    const pages = layoutLabelSheet([{ name: "Maceta", code: "2000000000015", count: 1 }]);

    expect(pages).toHaveLength(1);
    expect(pages[0]?.labels).toHaveLength(1);
    expect(pages[0]?.labels[0]).toMatchObject({
      name: "Maceta",
      code: "2000000000015",
      xMm: 0,
      yMm: 0,
      widthMm: LABEL_WIDTH_MM,
      heightMm: LABEL_HEIGHT_MM,
    });
  });

  it("fills product by product, repeating each product its requested count", () => {
    const pages = layoutLabelSheet([
      { name: "Almendras", code: "2000000000015", count: 2 },
      { name: "Nueces", code: "2000000000022", count: 1 },
    ]);

    expect(pages[0]?.labels.map((label) => label.name)).toEqual([
      "Almendras",
      "Almendras",
      "Nueces",
    ]);
  });

  it("tiles labels left to right, top to bottom, at their column/row position", () => {
    const pages = layoutLabelSheet([{ name: "Maceta", code: "2000000000015", count: 4 }]);
    const labels = pages[0]?.labels ?? [];

    expect(labels.map((label) => [label.xMm, label.yMm])).toEqual([
      [0, 0],
      [LABEL_WIDTH_MM, 0],
      [2 * LABEL_WIDTH_MM, 0],
      [0, LABEL_HEIGHT_MM],
    ]);
  });

  it("fills a full sheet of 24 labels on one page, spilling the 25th onto a second page", () => {
    const pages = layoutLabelSheet([{ name: "Maceta", code: "2000000000015", count: 25 }]);

    expect(pages).toHaveLength(2);
    expect(pages[0]?.labels).toHaveLength(LABELS_PER_PAGE);
    expect(pages[1]?.labels).toHaveLength(1);
    expect(pages[1]?.labels[0]).toMatchObject({ xMm: 0, yMm: 0 });
  });

  it("draws a cut line only between two adjacent labels, never at the sheet's edge", () => {
    const pages = layoutLabelSheet([
      { name: "Maceta", code: "2000000000015", count: LABELS_PER_PAGE },
    ]);
    const labels = pages[0]?.labels ?? [];

    // First label (col 0, row 0): a label to its right and below, so both cuts are drawn.
    expect(labels[0]).toMatchObject({ cutRight: true, cutBottom: true });
    // Third label (col 2, row 0): the sheet's right edge, no cut even though a label follows below.
    expect(labels[2]).toMatchObject({ cutRight: false, cutBottom: true });
    // Last label (col 2, row 7): the sheet's bottom-right corner, no cuts at all.
    expect(labels[23]).toMatchObject({ cutRight: false, cutBottom: false });
  });

  it("never draws a cut line toward a slot with no label on a partial last page", () => {
    const pages = layoutLabelSheet([{ name: "Maceta", code: "2000000000015", count: 25 }]);
    const onlyLabelOnSecondPage = pages[1]?.labels[0];

    expect(onlyLabelOnSecondPage).toMatchObject({ cutRight: false, cutBottom: false });
  });
});
