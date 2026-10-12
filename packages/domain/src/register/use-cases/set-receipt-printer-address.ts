import type { OperationAuthority } from "../../shared/index.js";
import type { ReceiptPrinterAddress } from "../model/receipt-printer-address.js";
import type { ReceiptPrinterSettings } from "./receipt-printer-settings.js";

export interface SetReceiptPrinterAddressPorts<Grant, Refusal> {
  settings: ReceiptPrinterSettings;
  authority: OperationAuthority<Grant, Refusal>;
}

export interface SetReceiptPrinterAddressInput {
  address: ReceiptPrinterAddress;
}

export type SetReceiptPrinterAddressOutcome = { kind: "saved"; address: ReceiptPrinterAddress };

export async function setReceiptPrinterAddress<Grant, Refusal>(
  { settings, authority }: SetReceiptPrinterAddressPorts<Grant, Refusal>,
  { address }: SetReceiptPrinterAddressInput,
): Promise<SetReceiptPrinterAddressOutcome | Refusal> {
  const authorization = await authority.authorize();
  if (authorization.kind === "refused") {
    return authorization.refusal;
  }
  settings.saveReceiptPrinterAddress(address);
  return { kind: "saved", address };
}
