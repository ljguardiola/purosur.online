import { PDFDocument } from "pdf-lib";
import { hasPdfSignature } from "./pdf-signature.js";

const PDF_TOKEN =
  /endstream|stream|endobj|obj|trailer|startxref|\/Type\s*\/XRef\b|\/Encrypt\s+\d+\s+\d+\s+R\b/g;

type Place = "outside" | "trailer" | "object" | "stream data";

export function declaresEncryption(bytes: Uint8Array): boolean {
  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1");
  let place: Place = "outside";
  let crossReferenceStream = false;
  let encryptionReference = false;
  for (const [token] of text.matchAll(PDF_TOKEN)) {
    if (place === "stream data") {
      place = token === "endstream" ? "outside" : place;
    } else if (token === "trailer") {
      place = "trailer";
    } else if (token === "obj") {
      place = "object";
      crossReferenceStream = false;
      encryptionReference = false;
    } else if (token === "stream") {
      if (place === "object" && crossReferenceStream && encryptionReference) {
        return true;
      }
      place = "stream data";
    } else if (token.startsWith("/Encrypt")) {
      if (place === "trailer") {
        return true;
      }
      encryptionReference = true;
    } else if (token.startsWith("/Type")) {
      crossReferenceStream = true;
    } else {
      place = "outside";
    }
  }
  return false;
}

export async function opensAsPdf(bytes: Uint8Array): Promise<boolean> {
  if (!hasPdfSignature(bytes)) {
    return false;
  }
  if (declaresEncryption(bytes)) {
    return true;
  }
  try {
    const document = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return document.getPageCount() > 0;
  } catch {
    return false;
  }
}
