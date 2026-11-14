import { describe, expect, it } from "vitest";
import {
  returnTicketRequestFrom,
  returnTicketRequestSchema,
  scannedReturnReading,
} from "./return-ticket-form";

const FISCAL_QR = `https://www.arca.gob.ar/fe/qr/?p=${btoa(JSON.stringify({ ver: 1, ptoVta: 3, tipoCmp: 11, nroCmp: 1192 }))}`;

describe("the number typed in the search", () => {
  it.each([
    ["0003-00001192", 3, 1192],
    ["00003-00001192", 3, 1192],
    ["3-1", 3, 1],
    [" 3-1192 ", 3, 1192],
  ])(
    "is looked up as typed, however many zeros the ticket prints: %j",
    (text, pointOfSale, number) => {
      const request = returnTicketRequestFrom({ search: text });

      expect(request).toEqual({ reading: { kind: "typed", point_of_sale: pointOfSale, number } });
      expect(returnTicketRequestSchema.safeParse(request).success).toBe(true);
    },
  );

  it.each(["", "1192", "0-1192", "100000-1192", "3-", "3-0", "3-11,5", "A3-1192", "3-1-2"])(
    "is not a ticket's number: %j",
    (text) => {
      const issues = returnTicketRequestSchema.safeParse(returnTicketRequestFrom({ search: text }))
        .error?.issues;

      expect(issues?.map(({ path }) => path[0])).toContain("reading");
    },
  );
});

describe("the text the reader scans", () => {
  it("is looked up as scanned when it is the QR of a factura C", () => {
    expect(scannedReturnReading(FISCAL_QR)).toEqual({ kind: "scanned", text: FISCAL_QR });
  });

  it("is looked up as scanned when it is the QR of a deferred sale", () => {
    const text = "purosur-deferred-sale:0198-abc:7KQ4M2P9";

    expect(scannedReturnReading(text)).toEqual({ kind: "scanned", text });
  });

  it.each(["7790001", "https://example.test/qr", ""])("is not a ticket's QR: %j", (text) => {
    expect(scannedReturnReading(text)).toBeUndefined();
  });
});
