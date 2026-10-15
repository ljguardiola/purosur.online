export interface SerialLink {
  write(data: Uint8Array): void;
  on(event: "data", listener: (chunk: Uint8Array) => void): unknown;
  on(event: "error" | "close", listener: () => void): unknown;
  close(): void;
}

const SERIAL_BAUD_RATE = 9600;

interface SerialPortOptions {
  path: string;
  baudRate: number;
  dataBits: 8;
  parity: "none";
  stopBits: 1;
  autoOpen: false;
}

interface SerialPortHandle {
  readonly isOpen: boolean;
  open(callback: (error: Error | null) => void): void;
  write(data: Uint8Array): unknown;
  on(event: "data" | "error" | "close", listener: (chunk: Uint8Array) => void): unknown;
  close(): unknown;
}

async function createSerialPort(options: SerialPortOptions): Promise<SerialPortHandle> {
  const { SerialPort } = await import("serialport");
  return new SerialPort(options);
}

export async function openSerialLink(
  path: string,
  createPort: (options: SerialPortOptions) => Promise<SerialPortHandle> = createSerialPort,
): Promise<SerialLink> {
  const port = await createPort({
    path,
    baudRate: SERIAL_BAUD_RATE,
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
