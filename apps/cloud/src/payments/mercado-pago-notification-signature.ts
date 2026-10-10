import { createHmac, timingSafeEqual } from "node:crypto";

export interface MercadoPagoNotificationSignatureInput {
  secret: string;
  signatureHeader: string | undefined;
  requestId: string | undefined;
  dataId: string | undefined;
}

type MercadoPagoNotificationRefusal =
  | "missing_signature"
  | "malformed_signature"
  | "missing_request_id"
  | "missing_data_id"
  | "mismatch";

export type MercadoPagoNotificationSignatureCheck =
  | { kind: "signed"; dataId: string }
  | { kind: "refused"; reason: MercadoPagoNotificationRefusal };

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

function signs(secret: string, manifest: string, hash: Buffer): boolean {
  return timingSafeEqual(createHmac("sha256", secret).update(manifest).digest(), hash);
}

export function verifyMercadoPagoNotificationSignature({
  secret,
  signatureHeader,
  requestId,
  dataId,
}: MercadoPagoNotificationSignatureInput): MercadoPagoNotificationSignatureCheck {
  if (!signatureHeader) {
    return { kind: "refused", reason: "missing_signature" };
  }
  const { ts, v1 } = signatureParts(signatureHeader);
  if (ts === undefined || v1 === undefined || !SHA256_HEX.test(v1)) {
    return { kind: "refused", reason: "malformed_signature" };
  }
  if (!requestId) {
    return { kind: "refused", reason: "missing_request_id" };
  }
  if (!dataId) {
    return { kind: "refused", reason: "missing_data_id" };
  }
  // Mercado Pago's SDKs sign an alphanumeric data.id exactly as sent, while its notification
  // documentation tells to lowercase it; a signature over either form is Mercado Pago's.
  const hash = Buffer.from(v1, "hex");
  const signedAsSent = signs(secret, `id:${dataId};request-id:${requestId};ts:${ts};`, hash);
  const signedLowercased = signs(
    secret,
    `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`,
    hash,
  );
  return signedAsSent || signedLowercased
    ? { kind: "signed", dataId }
    : { kind: "refused", reason: "mismatch" };
}
