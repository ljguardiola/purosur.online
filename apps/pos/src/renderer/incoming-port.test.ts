import { describe, expect, it, vi } from "vitest";
import { attachIncomingPort, type IncomingPortEvent, type PortEventSource } from "./incoming-port";

class FakePort {
  closed = false;

  close(): void {
    this.closed = true;
  }
}

const ownWindow = { name: "own window" };
const otherWindow = { name: "another frame" };

class FakeSource implements PortEventSource<FakePort> {
  private listener: ((event: IncomingPortEvent<FakePort>) => void) | undefined;

  addEventListener(_type: "message", listener: (event: IncomingPortEvent<FakePort>) => void) {
    this.listener = listener;
  }

  removeEventListener(_type: "message", listener: (event: IncomingPortEvent<FakePort>) => void) {
    if (this.listener === listener) {
      this.listener = undefined;
    }
  }

  dispatch(
    ports: readonly FakePort[],
    { source = ownWindow, data = "core-port" }: { source?: unknown; data?: unknown } = {},
  ): void {
    this.listener?.({ ports, source, data });
  }
}

describe("attachIncomingPort", () => {
  it("hands the first port from the core-port message to the callback", () => {
    const source = new FakeSource();
    const onPort = vi.fn();
    const port = new FakePort();

    attachIncomingPort(source, ownWindow, onPort);
    source.dispatch([port]);

    expect(onPort).toHaveBeenCalledExactlyOnceWith(port);
  });

  it("ignores a message event carrying no port", () => {
    const source = new FakeSource();
    const onPort = vi.fn();

    attachIncomingPort(source, ownWindow, onPort);
    source.dispatch([]);

    expect(onPort).not.toHaveBeenCalled();
  });

  it("ignores a port posted by any window other than its own", () => {
    const source = new FakeSource();
    const onPort = vi.fn();
    const port = new FakePort();

    attachIncomingPort(source, ownWindow, onPort);
    source.dispatch([port], { source: otherWindow });

    expect(onPort).not.toHaveBeenCalled();
  });

  it("ignores a port that arrives with any message other than core-port", () => {
    const source = new FakeSource();
    const onPort = vi.fn();

    attachIncomingPort(source, ownWindow, onPort);
    source.dispatch([new FakePort()], { data: "something-else" });
    source.dispatch([new FakePort()], { data: { type: "core-port" } });

    expect(onPort).not.toHaveBeenCalled();
  });

  it("keeps the current port when an unrelated message carries another one", () => {
    const source = new FakeSource();
    const onPort = vi.fn();
    const current = new FakePort();

    attachIncomingPort(source, ownWindow, onPort);
    source.dispatch([current]);
    source.dispatch([new FakePort()], { source: otherWindow });

    expect(current.closed).toBe(false);
    expect(onPort).toHaveBeenCalledOnce();
  });

  it("keeps listening for further ports instead of stopping after the first one", () => {
    const source = new FakeSource();
    const onPort = vi.fn();
    const first = new FakePort();
    const second = new FakePort();
    const third = new FakePort();

    attachIncomingPort(source, ownWindow, onPort);
    source.dispatch([first]);
    source.dispatch([second]);
    source.dispatch([third]);

    expect(onPort).toHaveBeenCalledTimes(3);
    expect(onPort).toHaveBeenNthCalledWith(3, third);
  });

  it("closes the previous port when a fresh one replaces it", () => {
    const source = new FakeSource();
    const onPort = vi.fn();
    const first = new FakePort();
    const second = new FakePort();

    attachIncomingPort(source, ownWindow, onPort);
    source.dispatch([first]);
    source.dispatch([second]);

    expect(first.closed).toBe(true);
    expect(second.closed).toBe(false);
  });

  it("lets the caller detach before any port arrives", () => {
    const source = new FakeSource();
    const onPort = vi.fn();

    const detach = attachIncomingPort(source, ownWindow, onPort);
    detach();
    source.dispatch([new FakePort()]);

    expect(onPort).not.toHaveBeenCalled();
  });

  it("closes the current port when the caller detaches", () => {
    const source = new FakeSource();
    const onPort = vi.fn();
    const port = new FakePort();

    const detach = attachIncomingPort(source, ownWindow, onPort);
    source.dispatch([port]);
    detach();

    expect(port.closed).toBe(true);
  });
});
