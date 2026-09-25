import { readFileSync } from "node:fs";
import PDFDocument from "pdfkit";
import {
  BAR_HEIGHT_MM,
  ean13BarcodeGeometry,
  GUARD_BAR_EXTRA_MM,
  HUMAN_READABLE_HEIGHT_MM,
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
  type LabelSheetItem,
  layoutLabelSheet,
  type PositionedLabel,
} from "./label-sheet-layout.js";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

const PADDING_LEFT_RIGHT_MM = 6;
const BARCODE_HEIGHT_MM = BAR_HEIGHT_MM + GUARD_BAR_EXTRA_MM + HUMAN_READABLE_HEIGHT_MM;
const CUT_LINE_WIDTH_MM = 0.2;
const CUT_LINE_COLOR = "#999999";
// The six-digit half of a barcode's own module width (6 digits × 7 modules × the module width).
const DIGIT_GROUP_WIDTH_MM = 42 * 0.33;
const FIRST_DIGIT_BOX_WIDTH_MM = 11 * 0.33;

// pdfkit's built-in Helvetica-Bold only encodes WinAnsi, silently garbling any other character
// (Greek, Cyrillic, "ő", "≈"); Liberation Sans Bold is metric-compatible with it and covers them.
// `fonts/` sits beside `src/` and `dist/` alike, and ships through package.json's `files`.
const NAME_FONT = "LiberationSans-Bold";
const NAME_FONT_FILE = readFileSync(
  new URL("../../fonts/LiberationSans-Bold.ttf", import.meta.url),
);

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

/**
 * The name's own rendered height at the label's content width, word-wrapped up to
 * `NAME_MAX_LINES` lines and clamped there (`drawName`'s `ellipsis: true` then truncates whatever
 * doesn't fit). Measured with pdfkit's own `heightOfString` and the same line spacing `drawName`
 * renders with: reserving a height computed from a different (e.g. CSS-derived)
 * per-line estimate would under- or over-shoot pdfkit's real wrapping and either clip a line that
 * should have shown, or leave a gap above a name that didn't need the full box.
 */
function measuredNameHeightMm(doc: PDFKit.PDFDocument, name: string): number {
  doc.font(NAME_FONT).fontSize(NAME_FONT_SIZE_PT);
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
  doc.font(NAME_FONT).fontSize(NAME_FONT_SIZE_PT).fillColor("#000000");
  // pdfkit's wrapper decides where to stop and ellipsize from the font's own line height, ignoring
  // `lineGap`: it ellipsizes a line unless two more of those fit under `height`, and stops once
  // one more doesn't. This height lets exactly `NAME_MAX_LINES` lines through, ellipsizing the last.
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
  const geometry = ean13BarcodeGeometry(label.code);
  const originXMm =
    label.xMm + PADDING_LEFT_RIGHT_MM + (CONTENT_WIDTH_MM - geometry.totalWidthMm) / 2;

  doc.fillColor("#000000");
  for (const bar of geometry.bars) {
    doc.rect(mm(originXMm + bar.xMm), mm(topMm), mm(bar.widthMm), mm(bar.heightMm)).fill();
  }

  const digitsTopMm = topMm + BAR_HEIGHT_MM + GUARD_BAR_EXTRA_MM;
  const fontSizePt = HUMAN_READABLE_HEIGHT_MM * PT_PER_MM;
  // Bold, not the proof's plain weight, to read at print size the way the proof's own digits did.
  doc.font("Courier-Bold").fontSize(fontSizePt).fillColor("#000000");

  const firstDigitBoxWidthMm = FIRST_DIGIT_BOX_WIDTH_MM;
  doc.text(
    geometry.firstDigitText.value,
    mm(originXMm + geometry.firstDigitText.xMm - firstDigitBoxWidthMm),
    mm(digitsTopMm),
    { width: mm(firstDigitBoxWidthMm), align: "right", lineBreak: false },
  );

  for (const group of [geometry.leftGroupText, geometry.rightGroupText]) {
    doc.text(group.value, mm(originXMm + group.xMm - DIGIT_GROUP_WIDTH_MM / 2), mm(digitsTopMm), {
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

/**
 * Renders an ordered, product-by-product list of labels as a printable A4 PDF: a 3×8 grid of
 * 70 × 37.125mm labels tiling each sheet with no page margin, dashed cut lines only between
 * labels, and each label's name plus its EAN-13 barcode, the format the owner validated on the
 * plain-paper proof (`drafts/odd/assets/310-label-sheet-proof.html`).
 */
export function renderLabelSheetPdf(items: LabelSheetItem[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [mm(A4_WIDTH_MM), mm(A4_HEIGHT_MM)],
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      autoFirstPage: false,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.registerFont(NAME_FONT, NAME_FONT_FILE);

    for (const page of layoutLabelSheet(items)) {
      doc.addPage();
      for (const label of page.labels) {
        drawLabel(doc, label);
      }
    }

    doc.end();
  });
}
