import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyResendWebhookSignature } from "./resend-webhook-signature.js";

const SECRET = "whsec_plJ3nmyCDGBKInavdOK15jsl";
const BODY = '{"event_type":"ping","data":{"success":true}}';
const ID = "msg_loFOjxBNrRLzqYUf";
const TIMESTAMP = "1731705121";
const SIGNATURE = "v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=";
const SIGNED_AT = new Date(Number(TIMESTAMP) * 1000);
const FIVE_MINUTES_MS = 5 * 60 * 1000;

function verify(overrides: Partial<Parameters<typeof verifyResendWebhookSignature>[0]> = {}) {
  return verifyResendWebhookSignature({
    secret: SECRET,
    rawBody: BODY,
    id: ID,
    timestamp: TIMESTAMP,
    signature: SIGNATURE,
    now: SIGNED_AT,
    ...overrides,
  });
}

function signed(secret: string, id: string, timestamp: string, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

describe("verifyResendWebhookSignature", () => {
  it("accepts the signature of the provider's documented example", () => {
    expect(verify()).toEqual({ kind: "valid" });
  });

  it("accepts a signature made with a secret that carries no prefix", () => {
    const secret = SECRET.replace("whsec_", "");

    expect(verify({ secret })).toEqual({ kind: "valid" });
  });

  it("accepts the message when any of the listed signatures of version one matches", () => {
    const other = signed("whsec_b3RoZXIgc2VjcmV0", ID, TIMESTAMP, BODY);

    expect(verify({ signature: `v2,AAAA ${other} ${SIGNATURE}` })).toEqual({ kind: "valid" });
  });

  it("refuses a body that differs from the signed one", () => {
    expect(verify({ rawBody: `${BODY} ` })).toEqual({ kind: "refused", reason: "mismatch" });
  });

  it("refuses a message id that differs from the signed one", () => {
    expect(verify({ id: "msg_other" })).toEqual({ kind: "refused", reason: "mismatch" });
  });

  it("refuses a signature made with another secret", () => {
    const signature = signed("whsec_b3RoZXIgc2VjcmV0", ID, TIMESTAMP, BODY);

    expect(verify({ signature })).toEqual({ kind: "refused", reason: "mismatch" });
  });

  it("refuses a signature of a version other than one", () => {
    expect(verify({ signature: SIGNATURE.replace("v1,", "v2,") })).toEqual({
      kind: "refused",
      reason: "mismatch",
    });
  });

  it("refuses a signature of another length without comparing it", () => {
    expect(verify({ signature: "v1,AAAA" })).toEqual({ kind: "refused", reason: "mismatch" });
  });

  it.each([
    ["id", { id: undefined }],
    ["timestamp", { timestamp: undefined }],
    ["signature", { signature: undefined }],
    ["id", { id: "" }],
    ["timestamp", { timestamp: "" }],
    ["signature", { signature: "" }],
  ])("refuses a message with no %s header", (_header, overrides) => {
    expect(verify(overrides)).toEqual({ kind: "refused", reason: "missing_headers" });
  });

  it("accepts a message signed exactly five minutes before now, and as much after", () => {
    expect(verify({ now: new Date(SIGNED_AT.getTime() + FIVE_MINUTES_MS) })).toEqual({
      kind: "valid",
    });
    expect(verify({ now: new Date(SIGNED_AT.getTime() - FIVE_MINUTES_MS) })).toEqual({
      kind: "valid",
    });
  });

  it("refuses a message signed more than five minutes before now, even with a valid signature", () => {
    expect(verify({ now: new Date(SIGNED_AT.getTime() + FIVE_MINUTES_MS + 1000) })).toEqual({
      kind: "refused",
      reason: "stale_timestamp",
    });
  });

  it("refuses a message signed more than five minutes after now, even with a valid signature", () => {
    expect(verify({ now: new Date(SIGNED_AT.getTime() - FIVE_MINUTES_MS - 1000) })).toEqual({
      kind: "refused",
      reason: "stale_timestamp",
    });
  });

  it.each(["yesterday", "1731705121.5", "1e9"])("refuses the timestamp %j", (timestamp) => {
    expect(verify({ timestamp })).toEqual({ kind: "refused", reason: "stale_timestamp" });
  });
});
