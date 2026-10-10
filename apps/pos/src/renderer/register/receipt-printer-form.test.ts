import { registerRendererToCoreMessageSchema } from "@purosur/contracts";
import { expect, test } from "vitest";
import {
  EMPTY_RECEIPT_PRINTER_FORM,
  INVALID_RECEIPT_PRINTER_ADDRESS_MESSAGE,
  receiptPrinterAddressText,
  receiptPrinterFormFrom,
  receiptPrinterMessage,
  receiptPrinterRequestFrom,
  receiptPrinterRequestSchema,
} from "./receipt-printer-form";

test.each([
  { stored: { host: "10.10.10.2", port: null }, shown: "10.10.10.2" },
  { stored: { host: "10.10.10.2", port: 9100 }, shown: "10.10.10.2:9100" },
  { stored: { host: "ticketera", port: 9101 }, shown: "ticketera:9101" },
])("the stored address $stored is shown as $shown", ({ stored, shown }) => {
  expect(receiptPrinterAddressText(stored)).toBe(shown);
  expect(receiptPrinterFormFrom(stored)).toEqual({ address: shown });
});

test("the form starts empty while no address is stored", () => {
  expect(receiptPrinterFormFrom(null)).toEqual(EMPTY_RECEIPT_PRINTER_FORM);
  expect(EMPTY_RECEIPT_PRINTER_FORM).toEqual({ address: "" });
});

test("the typed address is sent as it was typed", () => {
  expect(receiptPrinterRequestFrom({ address: " 10.10.10.2:9100 " })).toEqual({
    address: " 10.10.10.2:9100 ",
  });
});

test.each(["10.10.10.2", "10.10.10.2:9100", " ticketera ", "", "10.10.10.2:0", "una impresora"])(
  "the request's shape takes '%s' as the set-receipt-printer message does",
  (address) => {
    const message = { type: "set-receipt-printer", request_id: "r1", address };

    expect(receiptPrinterRequestSchema.safeParse({ address }).success).toBe(
      registerRendererToCoreMessageSchema.safeParse(message).success,
    );
  },
);

test.each([
  { typed: "", message: "Escribí la dirección de la impresora." },
  { typed: "   ", message: "Escribí la dirección de la impresora." },
  { typed: "10.10.10.2:0", message: INVALID_RECEIPT_PRINTER_ADDRESS_MESSAGE },
])("an address typed as '$typed' asks: $message", ({ typed, message }) => {
  expect(receiptPrinterMessage({ address: typed })).toBe(message);
});

test("the invalid address message gives an example with and without a port", () => {
  expect(INVALID_RECEIPT_PRINTER_ADDRESS_MESSAGE).toBe(
    "Escribí una dirección IP o un nombre de equipo, con el puerto después de dos puntos si hace falta, como 10.10.10.2 o 10.10.10.2:9100.",
  );
});
