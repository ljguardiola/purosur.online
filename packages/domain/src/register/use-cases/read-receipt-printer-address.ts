import type { OperationAuthority } from "../../shared/index.js";
import type { ReceiptPrinterAddress } from "../model/receipt-printer-address.js";
import type { ReceiptPrinterSettings } from "./receipt-printer-settings.js";

export interface ReadReceiptPrinterAddressPorts<Grant, Refusal> {
  settings: ReceiptPrinterSettings;
  authority: OperationAuthority<Grant, Refusal>;
}

export type ReadReceiptPrinterAddressOutcome =
  | { kind: "configured"; address: ReceiptPrinterAddress }
  | { kind: "not_configured" };

export async function readReceiptPrinterAddress<Grant, Refusal>({
  settings,
  authority,
}: ReadReceiptPrinterAddressPorts<Grant, Refusal>): Promise<
  ReadReceiptPrinterAddressOutcome | Refusal
> {
  const authorization = await authority.authorize();
  if (authorization.kind === "refused") {
    return authorization.refusal;
  }
  const address = settings.receiptPrinterAddress();
  return address === undefined ? { kind: "not_configured" } : { kind: "configured", address };
}
