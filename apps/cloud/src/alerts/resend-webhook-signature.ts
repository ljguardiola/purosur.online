import { createHmac, timingSafeEqual } from "node:crypto";

export interface ResendWebhookSignatureInput {
  secret: string;
  rawBody: string;
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  now: Date;
}

export type ResendWebhookSignatureCheck =
  | { kind: "valid" }
  | { kind: "refused"; reason: "missing_headers" | "stale_timestamp" | "mismatch" };

const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;
const SECRET_PREFIX = "whsec_";
const SIGNATURE_VERSION_PREFIX = "v1,";
const WHOLE_SECONDS = /^\d+$/;

function matches(expected: Buffer, listed: string): boolean {
  const candidate = Buffer.from(listed, "base64");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function verifyResendWebhookSignature({
  secret,
  rawBody,
  id,
  timestamp,
  signature,
  now,
}: ResendWebhookSignatureInput): ResendWebhookSignatureCheck {
  if (!id || !timestamp || !signature) {
    return { kind: "refused", reason: "missing_headers" };
  }
  if (
    !WHOLE_SECONDS.test(timestamp) ||
    Math.abs(now.getTime() - Number(timestamp) * 1000) > TIMESTAMP_TOLERANCE_MS
  ) {
    return { kind: "refused", reason: "stale_timestamp" };
  }
  const key = Buffer.from(
    secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret,
    "base64",
  );
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();
  const listed = signature
    .split(" ")
    .filter((entry) => entry.startsWith(SIGNATURE_VERSION_PREFIX))
    .map((entry) => entry.slice(SIGNATURE_VERSION_PREFIX.length));
  return listed.some((entry) => matches(expected, entry))
    ? { kind: "valid" }
    : { kind: "refused", reason: "mismatch" };
}
