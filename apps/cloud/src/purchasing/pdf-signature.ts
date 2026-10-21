const PDF_SIGNATURE = new TextEncoder().encode("%PDF-");

export function hasPdfSignature(bytes: Uint8Array): boolean {
  return PDF_SIGNATURE.every((byte, index) => bytes[index] === byte);
}
