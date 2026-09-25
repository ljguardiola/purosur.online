import PDFDocument from "pdfkit";
import {
  BAR_HEIGHT_MM,
  ean13BarcodeGeometry,
  GUARD_BAR_EXTRA_MM,
  HUMAN_READABLE_HEIGHT_MM,
} from "./ean13-barcode-geometry.js";
import {
  LABEL_HEIGHT_MM,
  LABEL_WIDTH_MM,
  type LabelSheetItem,
  layoutLabelSheet,
  type PositionedLabel,
} from "./label-sheet-layout.js";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PT_PER_MM = 72 / 25.4;

const PADDING_TOP_BOTTOM_MM = 4.5;
const PADDING_LEFT_RIGHT_MM = 6;
const CONTENT_GAP_MM = 1.5;
const NAME_FONT_SIZE_PT = 12;
const NAME_LINE_HEIGHT_PT = NAME_FONT_SIZE_PT * 1.2;
const NAME_BLOCK_HEIGHT_MM = (NAME_LINE_HEIGHT_PT * 2) / PT_PER_MM;
const CUT_LINE_WIDTH_MM = 0.2;
const CUT_LINE_COLOR = "#999999";
// The six-digit half of a barcode's own module width (6 digits × 7 modules × the module width).
const DIGIT_GROUP_WIDTH_MM = 42 * 0.33;
const FIRST_DIGIT_BOX_WIDTH_MM = 11 * 0.33;

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

function drawName(doc: PDFKit.PDFDocument, label: PositionedLabel, topMm: number): void {
  doc
    .font("Helvetica-Bold")
    .fontSize(NAME_FONT_SIZE_PT)
    .fillColor("#000000")
    .text(label.name, mm(label.xMm + PADDING_LEFT_RIGHT_MM), mm(topMm), {
      width: mm(LABEL_WIDTH_MM - 2 * PADDING_LEFT_RIGHT_MM),
      height: mm(NAME_BLOCK_HEIGHT_MM),
      align: "center",
      ellipsis: true,
    });
}

function drawBarcode(doc: PDFKit.PDFDocument, label: PositionedLabel, topMm: number): void {
  const geometry = ean13BarcodeGeometry(label.code);
  const contentWidthMm = LABEL_WIDTH_MM - 2 * PADDING_LEFT_RIGHT_MM;
  const originXMm =
    label.xMm + PADDING_LEFT_RIGHT_MM + (contentWidthMm - geometry.totalWidthMm) / 2;

  doc.fillColor("#000000");
  for (const bar of geometry.bars) {
    doc.rect(mm(originXMm + bar.xMm), mm(topMm), mm(bar.widthMm), mm(bar.heightMm)).fill();
  }

  const digitsTopMm = topMm + BAR_HEIGHT_MM + GUARD_BAR_EXTRA_MM;
  const fontSizePt = HUMAN_READABLE_HEIGHT_MM * PT_PER_MM;
  doc.font("Courier").fontSize(fontSizePt).fillColor("#000000");

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

  const geometry = ean13BarcodeGeometry(label.code);
  const contentHeightMm = NAME_BLOCK_HEIGHT_MM + CONTENT_GAP_MM + geometry.totalHeightMm;
  const availableHeightMm = LABEL_HEIGHT_MM - 2 * PADDING_TOP_BOTTOM_MM;
  const contentTopMm =
    label.yMm + PADDING_TOP_BOTTOM_MM + (availableHeightMm - contentHeightMm) / 2;

  drawName(doc, label, contentTopMm);
  drawBarcode(doc, label, contentTopMm + NAME_BLOCK_HEIGHT_MM + CONTENT_GAP_MM);
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
      compress: false,
      autoFirstPage: false,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    for (const page of layoutLabelSheet(items)) {
      doc.addPage();
      for (const label of page.labels) {
        drawLabel(doc, label);
      }
    }

    doc.end();
  });
}
