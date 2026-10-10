import { describe, expect, it } from "vitest";
import { verifyMercadoPagoNotificationSignature } from "./mercado-pago-notification-signature.js";
import {
  signatureHeader,
  WEBHOOK_SECRET,
} from "./test-support/mercado-pago-notification-signing.js";

const ORDER_ID = "ORD01JQ4S4KY8HWQ6NA5PXB65B3D3";

function verifying(
  overrides: Partial<Parameters<typeof verifyMercadoPagoNotificationSignature>[0]> = {},
) {
  return verifyMercadoPagoNotificationSignature({
    secret: WEBHOOK_SECRET,
    signatureHeader: signatureHeader({ dataId: ORDER_ID }),
    requestId: "request-1",
    dataId: ORDER_ID,
    ...overrides,
  });
}

function refusedFor(reason: string) {
  return { kind: "refused", reason };
}

describe("verifyMercadoPagoNotificationSignature", () => {
  it("accepts an order notification signed over its id exactly as it carries it", () => {
    expect(verifying()).toEqual({ kind: "signed", dataId: ORDER_ID });
  });

  it("accepts an order notification signed over its id in lowercase", () => {
    const header = signatureHeader({ dataId: ORDER_ID.toLowerCase() });

    expect(verifying({ signatureHeader: header })).toEqual({ kind: "signed", dataId: ORDER_ID });
  });

  it("accepts a notification of a numeric id, such as the panel's simulated one", () => {
    const header = signatureHeader({ dataId: "123456" });

    expect(verifying({ signatureHeader: header, dataId: "123456" })).toEqual({
      kind: "signed",
      dataId: "123456",
    });
  });

  it("refuses a signature made with another secret", () => {
    expect(verifying({ secret: "another-fake-secret" })).toMatchObject(refusedFor("mismatch"));
  });

  it("refuses a signature of another data id", () => {
    expect(verifying({ dataId: "ORD99OTHER" })).toMatchObject(refusedFor("mismatch"));
  });

  it("refuses a signature of another request id", () => {
    expect(verifying({ requestId: "request-2" })).toMatchObject(refusedFor("mismatch"));
  });

  it("refuses a signature whose timestamp was changed", () => {
    const header = signatureHeader({ dataId: ORDER_ID });

    expect(
      verifying({ signatureHeader: header.replace("ts=1760011200000", "ts=1760011200001") }),
    ).toMatchObject(refusedFor("mismatch"));
  });

  it("names, on a mismatch, the timestamp it read and every manifest it tried", () => {
    expect(verifying({ dataId: "ORD99OTHER" })).toEqual({
      kind: "refused",
      reason: "mismatch",
      ts: "1760011200000",
      manifests: [
        "id:ORD99OTHER;request-id:request-1;ts:1760011200000;",
        "id:ord99other;request-id:request-1;ts:1760011200000;",
      ],
    });
  });

  it("accepts the parts of the header in any order and with spaces after the commas", () => {
    const [ts, v1] = signatureHeader({ dataId: ORDER_ID }).split(",");

    expect(verifying({ signatureHeader: `${v1}, ${ts}` })).toEqual({
      kind: "signed",
      dataId: ORDER_ID,
    });
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
  ])("refuses a header that is %s as a missing signature", (_name, header) => {
    expect(verifying({ signatureHeader: header })).toEqual(refusedFor("missing_signature"));
  });

  it.each([
    ["without a timestamp", "v1=abc"],
    ["without a hash", "ts=1760011200000"],
    ["with an empty hash", "ts=1760011200000,v1="],
    ["with a hash of another length", "ts=1760011200000,v1=abcd"],
    ["with a hash that is not hexadecimal", `ts=1760011200000,v1=${"z".repeat(64)}`],
    ["garbage", "garbage"],
  ])("refuses a header %s as a malformed signature", (_name, header) => {
    expect(verifying({ signatureHeader: header })).toEqual(refusedFor("malformed_signature"));
  });

  it("refuses a notification without a request id", () => {
    expect(verifying({ requestId: undefined })).toEqual(refusedFor("missing_request_id"));
  });

  it("refuses a notification without a data id", () => {
    expect(verifying({ dataId: undefined })).toEqual(refusedFor("missing_data_id"));
  });
});
