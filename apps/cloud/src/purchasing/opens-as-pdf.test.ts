import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { declaresEncryption, opensAsPdf } from "./opens-as-pdf.js";
import { fictionalAesProtectedPdfWithPagesInAnObjectStream } from "./test-support/fictional-aes-protected-pdf.js";
import { fictionalPdf, fictionalPermissionsProtectedPdf } from "./test-support/fictional-pdf.js";

const bytes = (text: string) => new TextEncoder().encode(text);

async function pdfWithoutPages(): Promise<Uint8Array> {
  return (await PDFDocument.create()).save({ addDefaultPage: false });
}

describe("opensAsPdf", () => {
  it("accepts a PDF with one page or more", async () => {
    expect(await opensAsPdf(await fictionalPdf(1))).toBe(true);
    expect(await opensAsPdf(await fictionalPdf(12))).toBe(true);
  });

  it("accepts a PDF protected only by a permissions password", async () => {
    expect(await opensAsPdf(await fictionalPermissionsProtectedPdf(2))).toBe(true);
  });

  it("accepts a permissions-protected PDF whose pages sit in an encrypted object stream", async () => {
    expect(await opensAsPdf(fictionalAesProtectedPdfWithPagesInAnObjectStream())).toBe(true);
  });

  it("refuses a PDF without pages", async () => {
    expect(await opensAsPdf(await pdfWithoutPages())).toBe(false);
  });

  it("refuses a file that starts like a PDF but does not open as one", async () => {
    expect(await opensAsPdf(bytes("%PDF-1.7 not really a document"))).toBe(false);
    expect(await opensAsPdf(bytes("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"))).toBe(false);
  });

  it("refuses a PDF that does not start with the PDF signature", async () => {
    const pdf = await fictionalPdf(1);

    expect(await opensAsPdf(new Uint8Array([...bytes("<html>"), ...pdf]))).toBe(false);
  });

  it("refuses bytes that are not a PDF at all", async () => {
    expect(await opensAsPdf(bytes("<html></html>"))).toBe(false);
    expect(await opensAsPdf(new Uint8Array())).toBe(false);
  });
});

describe("declaresEncryption", () => {
  const classicTrailer = (dictionary: string) =>
    bytes(
      `%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< ${dictionary} >>\nstartxref\n9\n%%EOF\n`,
    );

  it("is true for an encryption reference in a cross-reference stream dictionary", async () => {
    expect(declaresEncryption(fictionalAesProtectedPdfWithPagesInAnObjectStream())).toBe(true);
    expect(declaresEncryption(await fictionalPermissionsProtectedPdf(1))).toBe(true);
  });

  it("is true for an encryption reference in a trailer", () => {
    expect(declaresEncryption(classicTrailer("/Size 3 /Root 1 0 R /Encrypt 2 0 R"))).toBe(true);
  });

  it("is false for a PDF that references no encryption", async () => {
    expect(declaresEncryption(await fictionalPdf(2))).toBe(false);
    expect(declaresEncryption(classicTrailer("/Size 2 /Root 1 0 R"))).toBe(false);
  });

  it("is false for an encryption reference outside a trailer or cross-reference stream", () => {
    const inPageContent = bytes(
      "%PDF-1.4\n1 0 obj\n<< /Length 15 >>\nstream\n/Encrypt 2 0 R\nendstream\nendobj\n2 0 obj\n<< /Type /Catalog /Encrypt 2 0 R >>\nendobj\ntrailer\n<< /Size 3 /Root 2 0 R >>\nstartxref\n9\n%%EOF\n",
    );

    expect(declaresEncryption(inPageContent)).toBe(false);
  });
});
