const MAX_HOST_NAME_LENGTH = 253;
const MIN_PORT = 1;
const MAX_PORT = 65535;
const IPV4_OCTET_COUNT = 4;
const MAX_IPV4_OCTET = 255;
const IPV4_OCTET = /^(0|[1-9][0-9]{0,2})$/;
const HOST_NAME_LABEL = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const ONLY_DIGITS = /^[0-9]+$/;

function isIpv4Address(labels: readonly string[]): boolean {
  return (
    labels.length === IPV4_OCTET_COUNT &&
    labels.every((label) => IPV4_OCTET.test(label) && Number(label) <= MAX_IPV4_OCTET)
  );
}

export function isValidReceiptPrinterHost(host: string): boolean {
  const labels = host.split(".");
  if (ONLY_DIGITS.test(host.slice(host.lastIndexOf(".") + 1))) {
    return isIpv4Address(labels);
  }
  return (
    host.length <= MAX_HOST_NAME_LENGTH && labels.every((label) => HOST_NAME_LABEL.test(label))
  );
}

export function isValidReceiptPrinterPort(port: number): boolean {
  return Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT;
}
