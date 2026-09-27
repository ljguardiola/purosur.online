export interface IncomingPortEvent<Port> {
  ports: readonly Port[];
  source: unknown;
  data: unknown;
}

export interface PortEventSource<Port> {
  addEventListener(type: "message", listener: (event: IncomingPortEvent<Port>) => void): void;
  removeEventListener(type: "message", listener: (event: IncomingPortEvent<Port>) => void): void;
}

export interface ClosablePort {
  close(): void;
}

const CORE_PORT_MESSAGE = "core-port";

// Only a "core-port" message posted to this same window is adopted: a port from any other frame
// or message is ignored, and each new port closes whatever was current before.
export function attachIncomingPort<Port extends ClosablePort>(
  source: PortEventSource<Port>,
  ownWindow: unknown,
  onPort: (port: Port) => void,
): () => void {
  let currentPort: Port | undefined;

  const handleMessage = (event: IncomingPortEvent<Port>): void => {
    if (event.source !== ownWindow || event.data !== CORE_PORT_MESSAGE) {
      return;
    }

    const port = event.ports[0];
    if (port === undefined) {
      return;
    }

    currentPort?.close();
    currentPort = port;
    onPort(port);
  };

  source.addEventListener("message", handleMessage);
  return () => {
    source.removeEventListener("message", handleMessage);
    currentPort?.close();
    currentPort = undefined;
  };
}
