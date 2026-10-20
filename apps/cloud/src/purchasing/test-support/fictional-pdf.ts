import { PDFDocument } from "pdf-lib";

const FIRST_PAGE_WIDTH = 101;

// Page n (counting from 1) is FIRST_PAGE_WIDTH + n - 1 points wide, so a copy of some pages tells which ones it holds.
export async function fictionalPdf(pageCount: number): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  for (let page = 0; page < pageCount; page += 1) {
    document.addPage([FIRST_PAGE_WIDTH + page, 200]);
  }
  return document.save();
}

export async function pagesOfPdf(base64: string): Promise<number[]> {
  const document = await PDFDocument.load(Buffer.from(base64, "base64"));
  return document.getPages().map((page) => Math.round(page.getWidth()) - FIRST_PAGE_WIDTH + 1);
}
