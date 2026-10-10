import { serialDeviceIdentitySchema } from "@purosur/contracts";
import type { DetectedSerialDevice } from "@purosur/domain";
import type { SerialDeviceEnumeration } from "@purosur/domain/register/use-cases";

export interface ListedSerialPort {
  path: string;
  vendorId?: string | undefined;
  productId?: string | undefined;
}

export interface SerialportEnumerationDeps {
  list: () => Promise<ListedSerialPort[]>;
  onListed: () => void;
}

export async function listSerialPorts(): Promise<ListedSerialPort[]> {
  const { SerialPort } = await import("serialport");
  return SerialPort.list();
}

function detectedDeviceOf({
  path,
  vendorId,
  productId,
}: ListedSerialPort): DetectedSerialDevice | undefined {
  const identity = serialDeviceIdentitySchema.safeParse({
    vendor_id: vendorId?.toLowerCase(),
    product_id: productId?.toLowerCase(),
  });
  if (!identity.success) {
    return undefined;
  }
  return {
    path,
    identity: { vendorId: identity.data.vendor_id, productId: identity.data.product_id },
  };
}

export function serialportEnumeration({
  list,
  onListed,
}: SerialportEnumerationDeps): SerialDeviceEnumeration {
  let listedBefore = false;
  return {
    async detectedSerialDevices() {
      const ports = await list();
      if (!listedBefore) {
        listedBefore = true;
        onListed();
      }
      return ports.flatMap((port) => detectedDeviceOf(port) ?? []);
    },
  };
}
