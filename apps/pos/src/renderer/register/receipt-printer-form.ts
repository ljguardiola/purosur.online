import { receiptPrinterAddressTextSchema } from "@purosur/contracts";
import type { ReceiptPrinterAddress } from "@purosur/domain";
import { z } from "zod";

export const receiptPrinterRequestSchema = z.object({ address: receiptPrinterAddressTextSchema });

const REQUIRED_MESSAGE = "Escribí la dirección de la impresora.";

export const INVALID_RECEIPT_PRINTER_ADDRESS_MESSAGE =
  "Escribí una dirección IP o un nombre de equipo, con el puerto después de dos puntos si hace falta, como 10.10.10.2 o 10.10.10.2:9100.";

export type ReceiptPrinterFormValues = { address: string };

export const EMPTY_RECEIPT_PRINTER_FORM: ReceiptPrinterFormValues = { address: "" };

export function receiptPrinterAddressText({ host, port }: ReceiptPrinterAddress): string {
  return port === null ? host : [host, port].join(":");
}

export function receiptPrinterFormFrom(
  address: ReceiptPrinterAddress | null,
): ReceiptPrinterFormValues {
  return address === null
    ? EMPTY_RECEIPT_PRINTER_FORM
    : { address: receiptPrinterAddressText(address) };
}

export function receiptPrinterRequestFrom({ address }: ReceiptPrinterFormValues): {
  address: string;
} {
  return { address };
}

export function receiptPrinterMessage({ address }: ReceiptPrinterFormValues): string {
  return address.trim() === "" ? REQUIRED_MESSAGE : INVALID_RECEIPT_PRINTER_ADDRESS_MESSAGE;
}
