import type { PrinterLabelSize } from "@purosur/contracts";
import type { LabelSheetItem } from "@purosur/domain/catalog/use-cases";
import { formatProductDescription } from "@purosur/formatting";
import { Bitmap } from "./bitmap-canvas.js";
import { drawText, fontMetrics, measureText, wrapText } from "./bitmap-text.js";
import {
  type Ean13BarcodeDimensions,
  ean13BarcodeGeometry,
  ean13NarrowBarcodeGeometry,
} from "./ean13-barcode-geometry.js";

const DOTS_PER_MM = 8;
const REFERENCE_WIDTH_DOTS = 400;
const REFERENCE_HEIGHT_DOTS = 240;

const MARGIN_TOP_BOTTOM_REFERENCE_DOTS = 12;
const MARGIN_SIDE_REFERENCE_DOTS = 16;
const CONTENT_GAP_REFERENCE_DOTS = 8;
const NAME_FONT_SIZE_REFERENCE_DOTS = 30;
const NAME_LINE_HEIGHT_RATIO = 1.1;

const MIN_MODULE_DOTS = 2;
const STANDARD_BARCODE_MODULES = 11 + 95 + 7;
const BAR_HEIGHT_MODULES = 32;
const MIN_BAR_HEIGHT_MODULES = 16;
const GUARD_EXTRA_MODULES = 16 / 3;
const DIGITS_HEIGHT_MODULES = 25 / 3;
const DIGITS_BOTTOM_CLEARANCE_PER_MODULE = 1;

interface LabelMeasures {
  widthDots: number;
  heightDots: number;
  marginDots: number;
  sideMarginDots: number;
  gapDots: number;
  nameFontSize: number;
  nameLineHeight: number;
}

export function printerLabelDots(size: PrinterLabelSize): {
  widthDots: number;
  heightDots: number;
} {
  return { widthDots: size.widthMm * DOTS_PER_MM, heightDots: size.heightMm * DOTS_PER_MM };
}

function labelMeasures(size: PrinterLabelSize): LabelMeasures {
  const { widthDots, heightDots } = printerLabelDots(size);
  const scale = Math.min(widthDots / REFERENCE_WIDTH_DOTS, heightDots / REFERENCE_HEIGHT_DOTS);
  const nameFontSize = NAME_FONT_SIZE_REFERENCE_DOTS * scale;
  return {
    widthDots,
    heightDots,
    marginDots: Math.round(MARGIN_TOP_BOTTOM_REFERENCE_DOTS * scale),
    sideMarginDots: Math.round(MARGIN_SIDE_REFERENCE_DOTS * scale),
    gapDots: Math.round(CONTENT_GAP_REFERENCE_DOTS * scale),
    nameFontSize,
    nameLineHeight: Math.round(NAME_LINE_HEIGHT_RATIO * nameFontSize),
  };
}

function barcodeDimensions(moduleDots: number, barHeight: number): Ean13BarcodeDimensions {
  return {
    moduleWidth: moduleDots,
    barHeight,
    guardExtra: Math.round(GUARD_EXTRA_MODULES * moduleDots),
    digitsHeight: Math.round(DIGITS_HEIGHT_MODULES * moduleDots),
  };
}

interface BarcodeLayout {
  dimensions: Ean13BarcodeDimensions;
  narrow: boolean;
}

function barcodeLayout(measures: LabelMeasures): BarcodeLayout {
  const narrow = measures.widthDots < STANDARD_BARCODE_MODULES * MIN_MODULE_DOTS;
  let moduleDots = narrow
    ? MIN_MODULE_DOTS
    : Math.floor(measures.widthDots / STANDARD_BARCODE_MODULES);
  while (
    moduleDots > MIN_MODULE_DOTS &&
    barHeightAvailable(measures, moduleDots) < MIN_BAR_HEIGHT_MODULES * moduleDots
  ) {
    moduleDots -= 1;
  }
  const barHeight = Math.min(
    BAR_HEIGHT_MODULES * moduleDots,
    barHeightAvailable(measures, moduleDots),
  );
  return { dimensions: barcodeDimensions(moduleDots, barHeight), narrow };
}

function barHeightAvailable(measures: LabelMeasures, moduleDots: number): number {
  const { guardExtra, digitsHeight } = barcodeDimensions(moduleDots, 0);
  return (
    measures.heightDots -
    2 * measures.marginDots -
    measures.gapDots -
    measures.nameLineHeight -
    guardExtra -
    digitsHeight
  );
}

function drawName(bitmap: Bitmap, measures: LabelMeasures, lines: string[], top: number): void {
  const { ascent, descent } = fontMetrics(measures.nameFontSize);
  const leading = (measures.nameLineHeight - (ascent + descent)) / 2;
  lines.forEach((line, index) => {
    drawText(bitmap, line, {
      x: Math.floor((measures.widthDots - measureText(line, measures.nameFontSize)) / 2),
      baseline: Math.round(top + index * measures.nameLineHeight + leading + ascent),
      fontSize: measures.nameFontSize,
    });
  });
}

function drawBarcode(
  bitmap: Bitmap,
  measures: LabelMeasures,
  layout: BarcodeLayout,
  code: string,
  top: number,
): void {
  const { dimensions, narrow } = layout;
  const geometry = narrow
    ? ean13NarrowBarcodeGeometry(code, dimensions)
    : ean13BarcodeGeometry(code, dimensions);
  const left = Math.floor((measures.widthDots - geometry.totalWidth) / 2);
  for (const bar of geometry.bars) {
    bitmap.fillRect(left + bar.x, top, bar.width, bar.height);
  }

  const texts =
    "digitsText" in geometry
      ? [geometry.digitsText]
      : [geometry.firstDigitText, geometry.leftGroupText, geometry.rightGroupText];
  const fontSize = dimensions.digitsHeight;
  const baseline =
    top +
    geometry.digitsTop +
    geometry.digitsHeight -
    DIGITS_BOTTOM_CLEARANCE_PER_MODULE * dimensions.moduleWidth;
  for (const text of texts) {
    const width = measureText(text.value, fontSize);
    const x = text.align === "right" ? text.x - width : text.x - width / 2;
    drawText(bitmap, text.value, { x: left + x, baseline, fontSize });
  }
}

export interface PrinterLabelRaster {
  widthDots: number;
  heightDots: number;
  rows: Uint8Array;
}

export function renderPrinterLabelRaster(
  item: LabelSheetItem,
  size: PrinterLabelSize,
): PrinterLabelRaster {
  const measures = labelMeasures(size);
  const { widthDots, heightDots, marginDots, gapDots, nameLineHeight } = measures;
  const bitmap = new Bitmap(widthDots, heightDots);
  const layout = barcodeLayout(measures);
  const barcodeHeight = (
    layout.narrow
      ? ean13NarrowBarcodeGeometry(item.code, layout.dimensions)
      : ean13BarcodeGeometry(item.code, layout.dimensions)
  ).totalHeight;
  const maxLines = Math.max(
    1,
    Math.floor((heightDots - 2 * marginDots - gapDots - barcodeHeight) / nameLineHeight),
  );
  const lines = wrapText(
    formatProductDescription(item),
    widthDots - 2 * measures.sideMarginDots,
    maxLines,
    measures.nameFontSize,
  );
  const nameHeight = lines.length * nameLineHeight;
  const groupHeight = nameHeight + gapDots + barcodeHeight;
  const available = heightDots - 2 * marginDots;
  const nameTop = marginDots + Math.floor((available - groupHeight) / 2);

  drawName(bitmap, measures, lines, nameTop);
  drawBarcode(bitmap, measures, layout, item.code, nameTop + nameHeight + gapDots);
  return { widthDots, heightDots, rows: bitmap.pack() };
}
