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

// Main hands over a fresh port on every core restart and every page load/reload (see
// apps/pos/src/main/index.ts), since a MessagePort pair is single-use: each delivery here closes
// whatever port was current before and replaces it. Only the preload relays it, by posting the
// "core-port" message to this same window, so a port posted by any other frame or under any other
// message is never adopted.
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
