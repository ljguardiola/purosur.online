import type { OperationAuthority } from "../../shared/index.js";
import type { ReceiptPrinterAddress } from "../model/receipt-printer-address.js";
import type { ReceiptPrinterReplacement } from "./receipt-printer-replacement.js";
import type { ReceiptPrinterSettings } from "./receipt-printer-settings.js";

export interface SetReceiptPrinterAddressPorts<Grant, Refusal> {
  settings: ReceiptPrinterSettings;
  authority: OperationAuthority<Grant, Refusal>;
  replacement: ReceiptPrinterReplacement;
}

export interface SetReceiptPrinterAddressInput {
  address: ReceiptPrinterAddress;
}

export type SetReceiptPrinterAddressOutcome = { kind: "saved"; address: ReceiptPrinterAddress };

export async function setReceiptPrinterAddress<Grant, Refusal>(
  { settings, authority, replacement }: SetReceiptPrinterAddressPorts<Grant, Refusal>,
  { address }: SetReceiptPrinterAddressInput,
): Promise<SetReceiptPrinterAddressOutcome | Refusal> {
  const authorization = await authority.authorize();
  if (authorization.kind === "refused") {
    return authorization.refusal;
  }
  const replacesPrinter = !settings.isCurrentReceiptPrinter(address);
  settings.saveReceiptPrinterAddress(address);
  if (replacesPrinter) {
    replacement.receiptPrinterReplaced();
  }
  return { kind: "saved", address };
}
