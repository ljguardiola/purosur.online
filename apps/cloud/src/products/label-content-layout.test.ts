import { describe, expect, it } from "vitest";
import {
  BAR_HEIGHT_MM,
  GUARD_BAR_EXTRA_MM,
  HUMAN_READABLE_HEIGHT_MM,
} from "./ean13-barcode-geometry.js";
import {
  CONTENT_GAP_MM,
  layoutLabelContent,
  NAME_FONT_SIZE_PT,
  NAME_LINE_HEIGHT_PT,
  PADDING_TOP_BOTTOM_MM,
  PT_PER_MM,
} from "./label-content-layout.js";
import { LABEL_HEIGHT_MM } from "./label-sheet-layout.js";

const BARCODE_HEIGHT_MM = BAR_HEIGHT_MM + GUARD_BAR_EXTRA_MM + HUMAN_READABLE_HEIGHT_MM;

function layoutFor(lineCount: 1 | 2) {
  return layoutLabelContent({
    labelHeightMm: LABEL_HEIGHT_MM,
    paddingTopBottomMm: PADDING_TOP_BOTTOM_MM,
    nameHeightMm: (lineCount * NAME_LINE_HEIGHT_PT) / PT_PER_MM,
    gapMm: CONTENT_GAP_MM,
    barcodeHeightMm: BARCODE_HEIGHT_MM,
  });
}

describe("NAME_LINE_HEIGHT_PT", () => {
  it("spaces a name's lines at 1.1 times its font size, like the approved proof", () => {
    expect(NAME_LINE_HEIGHT_PT).toBeCloseTo(1.1 * NAME_FONT_SIZE_PT, 6);
  });
});

describe("layoutLabelContent", () => {
  it("centers a 1-line name's group lower (further from the top) than a 2-line name's", () => {
    const oneLine = layoutFor(1);
    const twoLines = layoutFor(2);

    expect(oneLine.nameTopMm).toBeGreaterThan(twoLines.nameTopMm);
  });

  it("keeps the barcode directly below the name, separated by the content gap", () => {
    const layout = layoutFor(1);

    expect(layout.barcodeTopMm).toBeCloseTo(
      layout.nameTopMm + layout.nameHeightMm + CONTENT_GAP_MM,
      6,
    );
  });

  it("keeps a 1-line name's group within the label's padded box", () => {
    const layout = layoutFor(1);

    expect(layout.nameTopMm).toBeGreaterThanOrEqual(PADDING_TOP_BOTTOM_MM);
    expect(layout.barcodeTopMm + BARCODE_HEIGHT_MM).toBeLessThanOrEqual(
      LABEL_HEIGHT_MM - PADDING_TOP_BOTTOM_MM,
    );
  });

  it("keeps a 2-line name's group within the label's padded box", () => {
    const layout = layoutFor(2);

    expect(layout.nameTopMm).toBeGreaterThanOrEqual(PADDING_TOP_BOTTOM_MM);
    expect(layout.barcodeTopMm + BARCODE_HEIGHT_MM).toBeLessThanOrEqual(
      LABEL_HEIGHT_MM - PADDING_TOP_BOTTOM_MM,
    );
  });
});
