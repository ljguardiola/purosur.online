export interface IncomingPortEvent<Port> {
  ports: readonly Port[];
}

export interface PortEventSource<Port> {
  addEventListener(type: "message", listener: (event: IncomingPortEvent<Port>) => void): void;
  removeEventListener(type: "message", listener: (event: IncomingPortEvent<Port>) => void): void;
}

// The preload only ever forwards one port, so this hands over the first one it sees and then
// gets out of the way instead of staying subscribed to every future window message.
export function attachIncomingPort<Port>(
  source: PortEventSource<Port>,
  onPort: (port: Port) => void,
): () => void {
  const handleMessage = (event: IncomingPortEvent<Port>): void => {
    const port = event.ports[0];
    if (port === undefined) {
      return;
    }

    source.removeEventListener("message", handleMessage);
    onPort(port);
  };

  source.addEventListener("message", handleMessage);
  return () => source.removeEventListener("message", handleMessage);
}
