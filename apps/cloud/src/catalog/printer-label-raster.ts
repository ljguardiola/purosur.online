import type { LabelSheetItem } from "@purosur/domain/catalog/use-cases";
import { formatProductDescription } from "@purosur/formatting";
import { Bitmap } from "./bitmap-canvas.js";
import { drawText, fontMetrics, measureText, wrapText } from "./bitmap-text.js";
import { type Ean13BarcodeDimensions, ean13BarcodeGeometry } from "./ean13-barcode-geometry.js";

export const PRINTER_LABEL_WIDTH_DOTS = 400;
export const PRINTER_LABEL_HEIGHT_DOTS = 240;

const MARGIN_TOP_BOTTOM_DOTS = 12;
const CONTENT_WIDTH_DOTS = 368;
const CONTENT_GAP_DOTS = 8;
const NAME_FONT_SIZE_DOTS = 30;
const NAME_LINE_HEIGHT_DOTS = Math.round(1.1 * NAME_FONT_SIZE_DOTS);
const NAME_MAX_LINES = 2;
const DIGITS_FONT_SIZE_DOTS = 25;
const DIGITS_BOTTOM_CLEARANCE_DOTS = 3;

const BARCODE_DIMENSIONS_DOTS: Ean13BarcodeDimensions = {
  moduleWidth: 3,
  barHeight: 96,
  guardExtra: 16,
  digitsHeight: 25,
};

function drawName(bitmap: Bitmap, lines: string[], top: number): void {
  const { ascent, descent } = fontMetrics(NAME_FONT_SIZE_DOTS);
  const leading = (NAME_LINE_HEIGHT_DOTS - (ascent + descent)) / 2;
  lines.forEach((line, index) => {
    drawText(bitmap, line, {
      x: Math.floor((PRINTER_LABEL_WIDTH_DOTS - measureText(line, NAME_FONT_SIZE_DOTS)) / 2),
      baseline: Math.round(top + index * NAME_LINE_HEIGHT_DOTS + leading + ascent),
      fontSize: NAME_FONT_SIZE_DOTS,
    });
  });
}

function drawBarcode(bitmap: Bitmap, code: string, top: number): void {
  const geometry = ean13BarcodeGeometry(code, BARCODE_DIMENSIONS_DOTS);
  const left = Math.floor((PRINTER_LABEL_WIDTH_DOTS - geometry.totalWidth) / 2);
  for (const bar of geometry.bars) {
    bitmap.fillRect(left + bar.x, top, bar.width, bar.height);
  }

  const baseline = top + geometry.digitsTop + geometry.digitsHeight - DIGITS_BOTTOM_CLEARANCE_DOTS;
  for (const text of [geometry.firstDigitText, geometry.leftGroupText, geometry.rightGroupText]) {
    const width = measureText(text.value, DIGITS_FONT_SIZE_DOTS);
    const x = text.align === "right" ? text.x - width : text.x - width / 2;
    drawText(bitmap, text.value, {
      x: left + x,
      baseline,
      fontSize: DIGITS_FONT_SIZE_DOTS,
    });
  }
}

export function renderPrinterLabelRaster(item: LabelSheetItem): Uint8Array {
  const bitmap = new Bitmap(PRINTER_LABEL_WIDTH_DOTS, PRINTER_LABEL_HEIGHT_DOTS);
  const lines = wrapText(
    formatProductDescription(item),
    CONTENT_WIDTH_DOTS,
    NAME_MAX_LINES,
    NAME_FONT_SIZE_DOTS,
  );
  const nameHeight = lines.length * NAME_LINE_HEIGHT_DOTS;
  const barcodeHeight = ean13BarcodeGeometry(item.code, BARCODE_DIMENSIONS_DOTS).totalHeight;
  const groupHeight = nameHeight + CONTENT_GAP_DOTS + barcodeHeight;
  const available = PRINTER_LABEL_HEIGHT_DOTS - 2 * MARGIN_TOP_BOTTOM_DOTS;
  const nameTop = MARGIN_TOP_BOTTOM_DOTS + Math.floor((available - groupHeight) / 2);

  drawName(bitmap, lines, nameTop);
  drawBarcode(bitmap, item.code, nameTop + nameHeight + CONTENT_GAP_DOTS);
  return bitmap.pack();
}
