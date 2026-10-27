import { describe, expect, it } from "vitest";
import {
  EMPTY_RETURN_TICKET_FORM,
  INVALID_INVOICE_NUMBER_MESSAGE,
  INVALID_POINT_OF_SALE_MESSAGE,
  returnTicketRequestFrom,
  returnTicketRequestSchema,
  scannedReturnReading,
} from "./return-ticket-form";

const FISCAL_QR = `https://www.arca.gob.ar/fe/qr/?p=${btoa(JSON.stringify({ ver: 1, ptoVta: 3, tipoCmp: 11, nroCmp: 1192 }))}`;

describe("the numbers typed from the ticket", () => {
  it("start empty", () => {
    expect(EMPTY_RETURN_TICKET_FORM).toEqual({ pointOfSale: "", number: "" });
  });

  it("are looked up as typed, however many zeros the ticket prints", () => {
    expect(returnTicketRequestFrom({ pointOfSale: "00003", number: "00001192" })).toEqual({
      reading: { kind: "typed", point_of_sale: 3, number: 1192 },
    });
  });

  it.each([
    { pointOfSale: "00003", number: "00001192" },
    { pointOfSale: "3", number: "1" },
    { pointOfSale: " 3 ", number: " 1192 " },
  ])("are accepted by the request's shape: %j", (values) => {
    expect(returnTicketRequestSchema.safeParse(returnTicketRequestFrom(values)).success).toBe(true);
  });

  it.each([
    { pointOfSale: "", number: "1192" },
    { pointOfSale: "0", number: "1192" },
    { pointOfSale: "100000", number: "1192" },
    { pointOfSale: "3", number: "" },
    { pointOfSale: "3", number: "0" },
    { pointOfSale: "3", number: "11,5" },
    { pointOfSale: "A3", number: "1192" },
  ])("are refused by the request's shape: %j", (values) => {
    expect(returnTicketRequestSchema.safeParse(returnTicketRequestFrom(values)).success).toBe(
      false,
    );
  });

  it("name what each refused field expects", () => {
    expect(INVALID_POINT_OF_SALE_MESSAGE).toBe("Tipeá el punto de venta impreso, como 00003.");
    expect(INVALID_INVOICE_NUMBER_MESSAGE).toBe(
      "Tipeá el número de comprobante impreso, como 00001192.",
    );
  });
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
