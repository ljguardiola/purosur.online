import { describe, expect, it } from "vitest";
import { TAX_AUTHORITY_QR_URL } from "../../fiscal/index.js";
import { ticketReferenceFromQrText } from "./ticket-reference.js";

function fiscalQr(voucherType: number): string {
  const payload = { ver: 1, ptoVta: 3, tipoCmp: voucherType, nroCmp: 1204 };
  return `${TAX_AUTHORITY_QR_URL}${btoa(JSON.stringify(payload))}`;
}

describe("ticketReferenceFromQrText", () => {
  it("names the factura C a ticket's fiscal QR carries", () => {
    expect(ticketReferenceFromQrText(fiscalQr(11))).toEqual({
      kind: "invoice",
      pointOfSale: 3,
      number: 1204,
    });
  });

  it("names the deferred sale a non-fiscal ticket's QR carries", () => {
    expect(ticketReferenceFromQrText("purosur-deferred-sale:0198-abc:7KQ4M2P9")).toEqual({
      kind: "deferred",
      id: "0198-abc",
      shortCode: "7KQ4M2P9",
    });
  });

  it("answers nothing for the QR of a credit note, which is not a sale's ticket", () => {
    expect(ticketReferenceFromQrText(fiscalQr(13))).toBeNull();
  });

  it.each(["", "hello", "https://example.com", "purosur-deferred-sale:"])(
    "answers nothing for %j",
    (text) => {
      expect(ticketReferenceFromQrText(text)).toBeNull();
    },
  );
});
