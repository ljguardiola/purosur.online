import { describe, expect, it, vi } from "vitest";
import { attachIncomingPort, type PortEventSource } from "./incoming-port";

class FakeSource implements PortEventSource<string> {
  private listener: ((event: { ports: readonly string[] }) => void) | undefined;

  addEventListener(_type: "message", listener: (event: { ports: readonly string[] }) => void) {
    this.listener = listener;
  }

  removeEventListener(_type: "message", listener: (event: { ports: readonly string[] }) => void) {
    if (this.listener === listener) {
      this.listener = undefined;
    }
  }

  dispatch(ports: readonly string[]): void {
    this.listener?.({ ports });
  }
}

describe("attachIncomingPort", () => {
  it("hands the first port from a message event to the callback", () => {
    const source = new FakeSource();
    const onPort = vi.fn();

    attachIncomingPort(source, onPort);
    source.dispatch(["the-port"]);

    expect(onPort).toHaveBeenCalledExactlyOnceWith("the-port");
  });

  it("ignores a message event carrying no port", () => {
    const source = new FakeSource();
    const onPort = vi.fn();

    attachIncomingPort(source, onPort);
    source.dispatch([]);

    expect(onPort).not.toHaveBeenCalled();
  });

  it("stops listening once a port has been handed over", () => {
    const source = new FakeSource();
    const onPort = vi.fn();

    attachIncomingPort(source, onPort);
    source.dispatch(["first"]);
    source.dispatch(["second"]);

    expect(onPort).toHaveBeenCalledOnce();
  });

  it("lets the caller detach before any port arrives", () => {
    const source = new FakeSource();
    const onPort = vi.fn();

    const detach = attachIncomingPort(source, onPort);
    detach();
    source.dispatch(["late"]);

    expect(onPort).not.toHaveBeenCalled();
  });
});
