import type { SalesCoreToRendererMessage } from "@purosur/contracts";
import { pathOfMatchingDevice, type SerialDeviceWatch } from "../register/serial-device-watch";
import type { SerialLink } from "./serial-link/open-serial-link";
import { createSerialBarcodeReader, type SerialBarcodeReaderDeps } from "./barcode-reader/serial-barcode-reader";

export interface BarcodeReaderWiringDeps {
  watch: Pick<SerialDeviceWatch, "start" | "reading"> | undefined;
  openLink: (path: string) => Promise<SerialLink>;
  tell: (message: SalesCoreToRendererMessage) => void;
  reportFailure: (context: string, error: unknown) => void;
  retryMs: number;
  timers?: SerialBarcodeReaderDeps["timers"];
}

interface BarcodeReaderWiring {
  startWatch(): Promise<void>;
  onDevicesChanged(): Promise<void>;
}

export function createBarcodeReaderWiring({
  watch,
  openLink,
  tell,
  reportFailure,
  retryMs,
  timers,
}: BarcodeReaderWiringDeps): BarcodeReaderWiring {
  const reader = createSerialBarcodeReader({
    path: () => watch && pathOfMatchingDevice(watch.reading(), "reader"),
    openLink,
    onCode: (code) => tell({ type: "barcode-read", code }),
    onFailure: (error) => reportFailure("reading the barcode reader", error),
    retryMs,
    ...(timers === undefined ? {} : { timers }),
  });
  return {
    startWatch: async () => {
      if (watch !== undefined) {
        await watch.start();
        await reader.sync();
      }
    },
    onDevicesChanged: () => reader.sync(),
  };
}
