import { describe, expect, it } from "vitest";
import {
  BAR_HEIGHT_MM,
  GUARD_BAR_EXTRA_MM,
  HUMAN_READABLE_HEIGHT_MM,
} from "./ean13-barcode-geometry.js";
import {
  CONTENT_GAP_MM,
  layoutLabelContent,
  PADDING_TOP_BOTTOM_MM,
  PT_PER_MM,
} from "./label-content-layout.js";
import { LABEL_HEIGHT_MM } from "./label-sheet-layout.js";

const BARCODE_HEIGHT_MM = BAR_HEIGHT_MM + GUARD_BAR_EXTRA_MM + HUMAN_READABLE_HEIGHT_MM;

// Helvetica-Bold 12pt's real per-line height (pdfkit's own `currentLineHeight(true)`), the same
// metric `label-sheet-pdf.ts` measures at render time. Using a smaller approximation here (as an
// earlier version did) would pass this test while still under-reserving space in the real
// renderer, which is exactly the bug this constant exists to catch.
const REAL_LINE_HEIGHT_MM = 14.28 / PT_PER_MM;

function layoutFor(lineCount: 1 | 2) {
  return layoutLabelContent({
    labelHeightMm: LABEL_HEIGHT_MM,
    paddingTopBottomMm: PADDING_TOP_BOTTOM_MM,
    nameHeightMm: lineCount * REAL_LINE_HEIGHT_MM,
    gapMm: CONTENT_GAP_MM,
    barcodeHeightMm: BARCODE_HEIGHT_MM,
  });
}

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

  it("keeps a 2-line name's group within half a millimeter of the label's padded box", () => {
    // A real 2-line name plus the fixed 1.5mm gap and 17.1mm barcode slightly exceeds the
    // available box (by well under 1mm), which the 4.5mm padding's own margin over the laser's
    // ~4mm unprintable edge absorbs.
    const layout = layoutFor(2);

    expect(layout.nameTopMm).toBeGreaterThan(PADDING_TOP_BOTTOM_MM - 0.5);
    expect(layout.barcodeTopMm + BARCODE_HEIGHT_MM).toBeLessThan(
      LABEL_HEIGHT_MM - PADDING_TOP_BOTTOM_MM + 0.5,
    );
  });
});
