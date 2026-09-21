export interface IncomingPortEvent<Port> {
  ports: readonly Port[];
}

export interface PortEventSource<Port> {
  addEventListener(type: "message", listener: (event: IncomingPortEvent<Port>) => void): void;
  removeEventListener(type: "message", listener: (event: IncomingPortEvent<Port>) => void): void;
}

export interface ClosablePort {
  close(): void;
}

// Main hands over a fresh port on every core restart and every page load/reload (see
// apps/pos/src/main/index.ts), since a MessagePort pair is single-use: each delivery here closes
// whatever port was current before and replaces it, instead of keeping only the very first port
// ever seen or leaking the ones that came before it.
export function attachIncomingPort<Port extends ClosablePort>(
  source: PortEventSource<Port>,
  onPort: (port: Port) => void,
): () => void {
  let currentPort: Port | undefined;

  const handleMessage = (event: IncomingPortEvent<Port>): void => {
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
