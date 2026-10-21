import { PDFDocument } from "pdf-lib";
import { hasPdfSignature } from "./pdf-signature.js";

export async function opensAsPdf(bytes: Uint8Array): Promise<boolean> {
  if (!hasPdfSignature(bytes)) {
    return false;
  }
  try {
    const document = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return document.getPageCount() > 0;
  } catch {
    return false;
  }
}
