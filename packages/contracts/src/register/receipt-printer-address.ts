import {
  isValidReceiptPrinterHost,
  isValidReceiptPrinterPort,
  type ReceiptPrinterAddress,
} from "@purosur/domain";
import { z } from "zod";

const PORT_DIGITS = /^[1-9][0-9]*$/;
const HOST_AND_PORT_SEPARATOR = ":";

export const receiptPrinterAddressSchema = z.object({
  host: z.string().refine(isValidReceiptPrinterHost),
  port: z.int().refine(isValidReceiptPrinterPort).nullable(),
});

export const receiptPrinterAddressTextSchema = z
  .string()
  .trim()
  .transform((text, context): ReceiptPrinterAddress => {
    const separator = text.indexOf(HOST_AND_PORT_SEPARATOR);
    const host = separator === -1 ? text : text.slice(0, separator);
    const portText = separator === -1 ? undefined : text.slice(separator + 1);
    const port =
      portText === undefined ? null : PORT_DIGITS.test(portText) ? Number(portText) : NaN;
    const address = { host, port };
    if (!receiptPrinterAddressSchema.safeParse(address).success) {
      context.addIssue({ code: "custom" });
      return z.NEVER;
    }
    return address;
  });
