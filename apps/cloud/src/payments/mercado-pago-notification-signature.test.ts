import { describe, expect, it } from "vitest";
import { verifyMercadoPagoNotificationSignature } from "./mercado-pago-notification-signature.js";
import {
  signatureHeader,
  WEBHOOK_SECRET,
} from "./test-support/mercado-pago-notification-signing.js";

const DATA_ID = "ORD01JQ4S4KY8HWQ6NA5PXB65B3D3";

function verifying(
  overrides: Partial<Parameters<typeof verifyMercadoPagoNotificationSignature>[0]> = {},
) {
  return verifyMercadoPagoNotificationSignature({
    secret: WEBHOOK_SECRET,
    signatureHeader: signatureHeader({ dataId: DATA_ID }),
    requestId: "request-1",
    dataId: DATA_ID.toLowerCase(),
    ...overrides,
  });
}

describe("verifyMercadoPagoNotificationSignature", () => {
  it("accepts a signature made with the secret over the notification's id, request id and timestamp", () => {
    expect(verifying()).toBe(true);
  });

  it("lowercases the data id in the manifest, whatever case the notification carries it in", () => {
    expect(verifying({ dataId: DATA_ID })).toBe(true);
    expect(verifying({ dataId: DATA_ID.toLowerCase() })).toBe(true);
  });

  it("refuses a signature made with another secret", () => {
    expect(verifying({ secret: "another-fake-secret" })).toBe(false);
  });

  it("refuses a signature of another data id", () => {
    expect(verifying({ dataId: "ord99other" })).toBe(false);
  });

  it("refuses a signature of another request id", () => {
    expect(verifying({ requestId: "request-2" })).toBe(false);
  });

  it("refuses a signature whose timestamp was changed", () => {
    const header = signatureHeader({ dataId: DATA_ID });

    expect(
      verifying({ signatureHeader: header.replace("ts=1760011200000", "ts=1760011200001") }),
    ).toBe(false);
  });

  it("accepts the parts of the header in any order and with spaces after the commas", () => {
    const [ts, v1] = signatureHeader({ dataId: DATA_ID }).split(",");

    expect(verifying({ signatureHeader: `${v1}, ${ts}` })).toBe(true);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["without a timestamp", "v1=abc"],
    ["without a hash", "ts=1760011200000"],
    ["with an empty hash", "ts=1760011200000,v1="],
    ["with a hash of another length", "ts=1760011200000,v1=abcd"],
    ["with a hash that is not hexadecimal", `ts=1760011200000,v1=${"z".repeat(64)}`],
    ["malformed", "garbage"],
  ])("refuses a header that is %s", (_name, header) => {
    expect(verifying({ signatureHeader: header })).toBe(false);
  });

  it("refuses a notification without a request id or a data id", () => {
    expect(verifying({ requestId: undefined })).toBe(false);
    expect(verifying({ dataId: undefined })).toBe(false);
  });
});
