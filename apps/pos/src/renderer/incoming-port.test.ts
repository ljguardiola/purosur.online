import { describe, expect, it, vi } from "vitest";
import { attachIncomingPort, type PortEventSource } from "./incoming-port";

class FakePort {
  closed = false;

  close(): void {
    this.closed = true;
  }
}

class FakeSource implements PortEventSource<FakePort> {
  private listener: ((event: { ports: readonly FakePort[] }) => void) | undefined;

  addEventListener(_type: "message", listener: (event: { ports: readonly FakePort[] }) => void) {
    this.listener = listener;
  }

  removeEventListener(_type: "message", listener: (event: { ports: readonly FakePort[] }) => void) {
    if (this.listener === listener) {
      this.listener = undefined;
    }
  }

  dispatch(ports: readonly FakePort[]): void {
    this.listener?.({ ports });
  }
}

describe("attachIncomingPort", () => {
  it("hands the first port from a message event to the callback", () => {
    const source = new FakeSource();
    const onPort = vi.fn();
    const port = new FakePort();

    attachIncomingPort(source, onPort);
    source.dispatch([port]);

    expect(onPort).toHaveBeenCalledExactlyOnceWith(port);
  });

  it("ignores a message event carrying no port", () => {
    const source = new FakeSource();
    const onPort = vi.fn();

    attachIncomingPort(source, onPort);
    source.dispatch([]);

    expect(onPort).not.toHaveBeenCalled();
  });

  it("keeps listening for further ports instead of stopping after the first one", () => {
    const source = new FakeSource();
    const onPort = vi.fn();
    const first = new FakePort();
    const second = new FakePort();
    const third = new FakePort();

    attachIncomingPort(source, onPort);
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

    attachIncomingPort(source, onPort);
    source.dispatch([first]);
    source.dispatch([second]);

    expect(first.closed).toBe(true);
    expect(second.closed).toBe(false);
  });

  it("lets the caller detach before any port arrives", () => {
    const source = new FakeSource();
    const onPort = vi.fn();

    const detach = attachIncomingPort(source, onPort);
    detach();
    source.dispatch([new FakePort()]);

    expect(onPort).not.toHaveBeenCalled();
  });

  it("closes the current port when the caller detaches", () => {
    const source = new FakeSource();
    const onPort = vi.fn();
    const port = new FakePort();

    const detach = attachIncomingPort(source, onPort);
    source.dispatch([port]);
    detach();

    expect(port.closed).toBe(true);
  });
});
