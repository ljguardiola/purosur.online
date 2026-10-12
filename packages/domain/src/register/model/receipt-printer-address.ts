export interface ReceiptPrinterAddress {
  host: string;
  port: number | null;
}

export function isSameReceiptPrinterAddress(
  first: ReceiptPrinterAddress,
  second: ReceiptPrinterAddress,
): boolean {
  return first.host.toLowerCase() === second.host.toLowerCase() && first.port === second.port;
}
