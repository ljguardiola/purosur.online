interface PortChannel<Port> {
  port1: Port;
  port2: Port;
}

export interface EstablishCoreConnectionDeps<Port> {
  createChannel(): PortChannel<Port>;
  sendToCore(port: Port): void;
  sendToRenderer(port: Port): void;
}

// A MessagePort pair is single-use: a fresh core process or a reloaded page each need a brand
// new pair, never one already handed out.
export function establishCoreConnection<Port>(deps: EstablishCoreConnectionDeps<Port>): void {
  const { port1, port2 } = deps.createChannel();
  deps.sendToCore(port1);
  deps.sendToRenderer(port2);
}
