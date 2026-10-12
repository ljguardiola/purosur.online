import type { ReceiptPrinterAddress } from "@purosur/domain";

export const RAW_PRINTING_PORT = 9100;

export function reachSameReceiptPrinter(
  first: ReceiptPrinterAddress,
  second: ReceiptPrinterAddress,
): boolean {
  return (
    first.host.toLowerCase() === second.host.toLowerCase() &&
    (first.port ?? RAW_PRINTING_PORT) === (second.port ?? RAW_PRINTING_PORT)
  );
}
