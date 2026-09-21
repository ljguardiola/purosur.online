export interface PortChannel<Port> {
  port1: Port;
  port2: Port;
}

export interface EstablishCoreConnectionDeps<Port> {
  createChannel(): PortChannel<Port>;
  sendToCore(port: Port): void;
  sendToRenderer(port: Port): void;
}

// Called on every core (re)launch and every renderer load/reload: a MessagePort pair is single
// use, so a fresh core process or a reloaded page each need a brand new pair to reconnect, never
// a port that was already handed out before.
export function establishCoreConnection<Port>(deps: EstablishCoreConnectionDeps<Port>): void {
  const { port1, port2 } = deps.createChannel();
  deps.sendToCore(port1);
  deps.sendToRenderer(port2);
}
