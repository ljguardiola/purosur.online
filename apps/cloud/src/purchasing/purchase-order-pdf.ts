import { readFileSync } from "node:fs";
import PDFDocument from "pdfkit";
import type { PurchaseOrderDocument } from "./purchase-order-document.js";

const MARGIN_PT = 50;
const TITLE_SIZE_PT = 18;
const DATE_SIZE_PT = 10;
const PRODUCT_SIZE_PT = 11;
const DETAIL_SIZE_PT = 10;
const LINE_GAP_PT = 14;
const DETAIL_INDENT_PT = 18;
const TEXT_COLOR = "#000000";
const DETAIL_COLOR = "#444444";

// pdfkit's built-in fonts only encode WinAnsi and silently garble any other character; Liberation
// Sans covers them.
const FONT = "LiberationSans-Bold";
const FONT_FILE = readFileSync(
  // `fonts/` sits beside both `src/` and `dist/` and ships through package.json's `files`.
  new URL("../../fonts/LiberationSans-Bold.ttf", import.meta.url),
);

export function renderPurchaseOrderPdf(
  { title, createdDay, lines }: PurchaseOrderDocument,
  createdAt: Date,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN_PT, bottom: MARGIN_PT, left: MARGIN_PT, right: MARGIN_PT },
      info: { CreationDate: createdAt },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.registerFont(FONT, FONT_FILE);

    const contentWidth = doc.page.width - 2 * MARGIN_PT;
    const detailWidth = contentWidth - DETAIL_INDENT_PT;
    const pageBottom = () => doc.page.height - MARGIN_PT;

    doc
      .font(FONT)
      .fontSize(TITLE_SIZE_PT)
      .fillColor(TEXT_COLOR)
      .text(title, { width: contentWidth });
    doc
      .fontSize(DATE_SIZE_PT)
      .fillColor(DETAIL_COLOR)
      .text(`Fecha: ${createdDay}`, { width: contentWidth });
    doc.moveDown();

    lines.forEach((line, index) => {
      const product = `${index + 1}. ${line.product}`;
      const detail = [
        line.quantity,
        ...(line.supplierItem === null ? [] : [`Artículo del proveedor: ${line.supplierItem}`]),
      ].join("\n");
      const height =
        doc.fontSize(PRODUCT_SIZE_PT).heightOfString(product, { width: contentWidth }) +
        doc.fontSize(DETAIL_SIZE_PT).heightOfString(detail, { width: detailWidth }) +
        LINE_GAP_PT;
      if (doc.y + height > pageBottom()) {
        doc.addPage();
      }
      doc
        .fontSize(PRODUCT_SIZE_PT)
        .fillColor(TEXT_COLOR)
        .text(product, MARGIN_PT, doc.y, { width: contentWidth });
      doc
        .fontSize(DETAIL_SIZE_PT)
        .fillColor(DETAIL_COLOR)
        .text(detail, MARGIN_PT + DETAIL_INDENT_PT, doc.y, { width: detailWidth });
      doc.y += LINE_GAP_PT;
    });

    doc.end();
  });
}
