import { PDFDocument, PDFName, PDFNumber } from "pdf-lib";

const FIRST_PAGE_WIDTH = 101;

// Page n (counting from 1) is FIRST_PAGE_WIDTH + n - 1 points wide, so a copy of some pages tells which ones it holds.
async function documentOfPages(pageCount: number): Promise<PDFDocument> {
  const document = await PDFDocument.create();
  for (let page = 0; page < pageCount; page += 1) {
    document.addPage([FIRST_PAGE_WIDTH + page, 200]);
  }
  return document;
}

export async function fictionalPdf(pageCount: number): Promise<Uint8Array> {
  return (await documentOfPages(pageCount)).save();
}

export async function fictionalPermissionsProtectedPdf(pageCount: number): Promise<Uint8Array> {
  const document = await documentOfPages(pageCount);
  document.context.trailerInfo.Encrypt = document.context.register(
    document.context.obj({ Filter: "Standard", V: 1, R: 2, O: "owner", U: "user", P: -44 }),
  );
  return document.save();
}

export async function fictionalPdfWithItsEncryptionDictionaryInTheTrailer(
  pageCount: number,
): Promise<Uint8Array> {
  const document = await documentOfPages(pageCount);
  document.context.trailerInfo.Encrypt = document.context.obj({
    Filter: "Standard",
    V: 1,
    R: 2,
    O: "owner",
    U: "user",
    P: -44,
  });
  return document.save();
}

export async function fictionalPdfWithPagesThatCannotBeCopied(
  pageCount: number,
  pagesThatCannotBeCopied: number[],
): Promise<Uint8Array> {
  const document = await documentOfPages(pageCount);
  for (const page of pagesThatCannotBeCopied) {
    document.getPage(page - 1).node.set(PDFName.of("Parent"), PDFNumber.of(0));
  }
  return document.save();
}

export async function pagesOfPdf(base64: string): Promise<number[]> {
  const document = await PDFDocument.load(Buffer.from(base64, "base64"));
  return document.getPages().map((page) => Math.round(page.getWidth()) - FIRST_PAGE_WIDTH + 1);
}
