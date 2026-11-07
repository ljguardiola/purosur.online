import type { LabelSheetItem } from "@purosur/domain/catalog/use-cases";
import PDFDocument from "pdfkit";
import { BOLD_FONT, BOLD_FONT_FILE } from "../platform/pdf-fonts.js";
import {
  BAR_HEIGHT_MM,
  DIGITS_PER_GROUP,
  type Ean13BarcodeDimensions,
  ean13BarcodeGeometry,
  GUARD_BAR_EXTRA_MM,
  HUMAN_READABLE_HEIGHT_MM,
  MODULE_WIDTH_MM,
  MODULES_PER_DIGIT,
  QUIET_ZONE_LEFT_MODULES,
} from "./ean13-barcode-geometry.js";
import {
  CONTENT_GAP_MM,
  layoutLabelContent,
  NAME_FONT_SIZE_PT,
  NAME_LINE_HEIGHT_PT,
  NAME_MAX_LINES,
  PADDING_TOP_BOTTOM_MM,
  PT_PER_MM,
} from "./label-content-layout.js";
import {
  LABEL_HEIGHT_MM,
  LABEL_WIDTH_MM,
  layoutLabelSheet,
  type PositionedLabel,
} from "./label-sheet-layout.js";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

const PADDING_LEFT_RIGHT_MM = 6;
const BARCODE_HEIGHT_MM = BAR_HEIGHT_MM + GUARD_BAR_EXTRA_MM + HUMAN_READABLE_HEIGHT_MM;
const CUT_LINE_WIDTH_MM = 0.2;
const CUT_LINE_COLOR = "#999999";
const DIGIT_GROUP_WIDTH_MM = DIGITS_PER_GROUP * MODULES_PER_DIGIT * MODULE_WIDTH_MM;
const FIRST_DIGIT_BOX_WIDTH_MM = QUIET_ZONE_LEFT_MODULES * MODULE_WIDTH_MM;

const BARCODE_DIMENSIONS_MM: Ean13BarcodeDimensions = {
  moduleWidth: MODULE_WIDTH_MM,
  barHeight: BAR_HEIGHT_MM,
  guardExtra: GUARD_BAR_EXTRA_MM,
  digitsHeight: HUMAN_READABLE_HEIGHT_MM,
};

function mm(valueMm: number): number {
  return valueMm * PT_PER_MM;
}

function drawCutLines(doc: PDFKit.PDFDocument, label: PositionedLabel): void {
  doc.save();
  doc.dash(mm(CUT_LINE_WIDTH_MM) * 4, { space: mm(CUT_LINE_WIDTH_MM) * 3 });
  doc.lineWidth(mm(CUT_LINE_WIDTH_MM));
  doc.strokeColor(CUT_LINE_COLOR);
  if (label.cutRight) {
    const x = mm(label.xMm + label.widthMm);
    doc
      .moveTo(x, mm(label.yMm))
      .lineTo(x, mm(label.yMm + label.heightMm))
      .stroke();
  }
  if (label.cutBottom) {
    const y = mm(label.yMm + label.heightMm);
    doc
      .moveTo(mm(label.xMm), y)
      .lineTo(mm(label.xMm + label.widthMm), y)
      .stroke();
  }
  doc.undash();
  doc.restore();
}

const CONTENT_WIDTH_MM = LABEL_WIDTH_MM - 2 * PADDING_LEFT_RIGHT_MM;

// Measured with pdfkit's own `heightOfString` and the same line spacing `drawName` renders with:
// a height from any other per-line estimate would under- or over-shoot pdfkit's real wrapping.
function measuredNameHeightMm(doc: PDFKit.PDFDocument, name: string): number {
  doc.font(BOLD_FONT).fontSize(NAME_FONT_SIZE_PT);
  const maxHeightPt = NAME_LINE_HEIGHT_PT * NAME_MAX_LINES;
  const naturalHeightPt = doc.heightOfString(name, {
    width: mm(CONTENT_WIDTH_MM),
    lineGap: nameLineGapPt(doc),
  });
  return Math.min(naturalHeightPt, maxHeightPt) / PT_PER_MM;
}

/** pdfkit advances each line by the font's own line height plus `lineGap`, here negative. */
function nameLineGapPt(doc: PDFKit.PDFDocument): number {
  return NAME_LINE_HEIGHT_PT - doc.currentLineHeight(true);
}

function drawName(doc: PDFKit.PDFDocument, label: PositionedLabel, topMm: number): void {
  doc.font(BOLD_FONT).fontSize(NAME_FONT_SIZE_PT).fillColor("#000000");
  // pdfkit's wrapper ellipsizes from the font's own line height, ignoring `lineGap`: this height
  // lets exactly `NAME_MAX_LINES` lines through before it ellipsizes the last.
  const wrapHeightPt =
    (NAME_MAX_LINES - 1) * NAME_LINE_HEIGHT_PT + 1.5 * doc.currentLineHeight(true);
  doc.text(label.name, mm(label.xMm + PADDING_LEFT_RIGHT_MM), mm(topMm), {
    width: mm(CONTENT_WIDTH_MM),
    height: wrapHeightPt,
    lineGap: nameLineGapPt(doc),
    align: "center",
    ellipsis: true,
  });
}

function drawBarcode(doc: PDFKit.PDFDocument, label: PositionedLabel, topMm: number): void {
  const geometry = ean13BarcodeGeometry(label.code, BARCODE_DIMENSIONS_MM);
  const originXMm =
    label.xMm + PADDING_LEFT_RIGHT_MM + (CONTENT_WIDTH_MM - geometry.totalWidth) / 2;

  doc.fillColor("#000000");
  for (const bar of geometry.bars) {
    doc.rect(mm(originXMm + bar.x), mm(topMm), mm(bar.width), mm(bar.height)).fill();
  }

  const digitsTopMm = topMm + geometry.digitsTop;
  const fontSizePt = geometry.digitsHeight * PT_PER_MM;
  doc.font("Courier-Bold").fontSize(fontSizePt).fillColor("#000000");

  const firstDigitBoxWidthMm = FIRST_DIGIT_BOX_WIDTH_MM;
  doc.text(
    geometry.firstDigitText.value,
    mm(originXMm + geometry.firstDigitText.x - firstDigitBoxWidthMm),
    mm(digitsTopMm),
    { width: mm(firstDigitBoxWidthMm), align: "right", lineBreak: false },
  );

  for (const group of [geometry.leftGroupText, geometry.rightGroupText]) {
    doc.text(group.value, mm(originXMm + group.x - DIGIT_GROUP_WIDTH_MM / 2), mm(digitsTopMm), {
      width: mm(DIGIT_GROUP_WIDTH_MM),
      align: "center",
      lineBreak: false,
    });
  }
}

function drawLabel(doc: PDFKit.PDFDocument, label: PositionedLabel): void {
  drawCutLines(doc, label);

  const nameHeightMm = measuredNameHeightMm(doc, label.name);
  const layout = layoutLabelContent({
    labelHeightMm: LABEL_HEIGHT_MM,
    paddingTopBottomMm: PADDING_TOP_BOTTOM_MM,
    nameHeightMm,
    gapMm: CONTENT_GAP_MM,
    barcodeHeightMm: BARCODE_HEIGHT_MM,
  });

  drawName(doc, label, label.yMm + layout.nameTopMm);
  drawBarcode(doc, label, label.yMm + layout.barcodeTopMm);
}

export function renderLabelSheetPdf(items: LabelSheetItem[], createdAt: Date): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [mm(A4_WIDTH_MM), mm(A4_HEIGHT_MM)],
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      autoFirstPage: false,
      info: { CreationDate: createdAt },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.registerFont(BOLD_FONT, BOLD_FONT_FILE);

    for (const page of layoutLabelSheet(items)) {
      doc.addPage();
      for (const label of page.labels) {
        drawLabel(doc, label);
      }
    }

    doc.end();
  });
}
