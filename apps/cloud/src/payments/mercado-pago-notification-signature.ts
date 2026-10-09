import { createHmac, timingSafeEqual } from "node:crypto";

export interface MercadoPagoNotificationSignatureInput {
  secret: string;
  signatureHeader: string | undefined;
  requestId: string | undefined;
  dataId: string | undefined;
}

const SHA256_HEX = /^[0-9a-f]{64}$/i;

function signatureParts(header: string): { ts?: string; v1?: string } {
  const parts: { ts?: string; v1?: string } = {};
  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=");
    if ((key === "ts" || key === "v1") && value) {
      parts[key] = value;
    }
  }
  return parts;
}

export function verifyMercadoPagoNotificationSignature({
  secret,
  signatureHeader,
  requestId,
  dataId,
}: MercadoPagoNotificationSignatureInput): boolean {
  if (!signatureHeader || !requestId || !dataId) {
    return false;
  }
  const { ts, v1 } = signatureParts(signatureHeader);
  if (ts === undefined || v1 === undefined || !SHA256_HEX.test(v1)) {
    return false;
  }
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest();
  return timingSafeEqual(expected, Buffer.from(v1, "hex"));
}
