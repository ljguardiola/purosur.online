import type { SerialLink } from "./systel-scale.js";

const SCALE_BAUD_RATE = 9600;

export async function openSerialLink(path: string): Promise<SerialLink> {
  const { SerialPort } = await import("serialport");
  const port = new SerialPort({
    path,
    baudRate: SCALE_BAUD_RATE,
    dataBits: 8,
    parity: "none",
    stopBits: 1,
    autoOpen: false,
  });
  await new Promise<void>((resolve, reject) => {
    port.open((error) => (error ? reject(error) : resolve()));
  });
  return {
    write: (data) => {
      port.write(data);
    },
    on: (event: "data" | "error" | "close", listener: (chunk: Uint8Array) => void) => {
      port.on(event, listener);
    },
    close: () => {
      if (port.isOpen) port.close();
    },
  };
}
