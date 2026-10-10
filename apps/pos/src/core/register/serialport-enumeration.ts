import type { DetectedSerialDevice } from "@purosur/domain";
import type { SerialDeviceEnumeration } from "@purosur/domain/register/use-cases";

export interface ListedSerialPort {
  path: string;
  vendorId?: string | undefined;
  productId?: string | undefined;
}

export interface SerialportEnumerationDeps {
  list: () => Promise<ListedSerialPort[]>;
  reportFailure: (error: unknown) => void;
  onListed: () => void;
}

const FOUR_HEX_DIGITS = /^[0-9a-f]{4}$/;

export async function listSerialPorts(): Promise<ListedSerialPort[]> {
  const { SerialPort } = await import("serialport");
  return SerialPort.list();
}

function detectedDeviceOf({
  path,
  vendorId,
  productId,
}: ListedSerialPort): DetectedSerialDevice | undefined {
  const vendor = vendorId?.toLowerCase();
  const product = productId?.toLowerCase();
  if (
    vendor === undefined ||
    product === undefined ||
    !FOUR_HEX_DIGITS.test(vendor) ||
    !FOUR_HEX_DIGITS.test(product)
  ) {
    return undefined;
  }
  return { path, identity: { vendorId: vendor, productId: product } };
}

export function serialportEnumeration({
  list,
  reportFailure,
  onListed,
}: SerialportEnumerationDeps): SerialDeviceEnumeration {
  let listedBefore = false;
  let failing = false;
  return {
    async detectedSerialDevices() {
      try {
        const ports = await list();
        failing = false;
        if (!listedBefore) {
          listedBefore = true;
          onListed();
        }
        return ports.flatMap((port) => detectedDeviceOf(port) ?? []);
      } catch (error) {
        if (!failing) {
          failing = true;
          reportFailure(error);
        }
        return [];
      }
    },
  };
}
