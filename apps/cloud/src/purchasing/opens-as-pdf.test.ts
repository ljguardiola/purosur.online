import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { opensAsPdf } from "./opens-as-pdf.js";
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
