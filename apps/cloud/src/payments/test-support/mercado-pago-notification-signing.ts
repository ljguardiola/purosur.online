import { createHmac } from "node:crypto";

export const WEBHOOK_SECRET = "test-only-webhook-secret-not-real";

export interface SignedNotification {
  dataId: string;
  requestId?: string;
  ts?: string;
}

export function signatureHeader({
  dataId,
  requestId = "request-1",
  ts = "1760011200000",
}: SignedNotification): string {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", WEBHOOK_SECRET).update(manifest).digest("hex");
  return `ts=${ts},v1=${v1}`;
}
