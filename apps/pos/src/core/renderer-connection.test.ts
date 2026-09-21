import { describe, expect, it, vi } from "vitest";
import { createRendererConnection, type RendererPort } from "./renderer-connection";

class FakePort implements RendererPort {
  started = false;
  closed = false;
  private listener: ((event: { data: unknown }) => void) | undefined;

  on(_event: "message", listener: (event: { data: unknown }) => void): void {
    this.listener = listener;
  }

  start(): void {
    this.started = true;
  }

  close(): void {
    this.closed = true;
  }

  receive(data: unknown): void {
    this.listener?.({ data });
  }
}

describe("createRendererConnection", () => {
  it("starts the adopted port and passes along every message it receives", () => {
    const onMessage = vi.fn();
    const connection = createRendererConnection(onMessage);
    const port = new FakePort();

    connection.adopt(port);
    port.receive({ type: "ping" });

    expect(port.started).toBe(true);
    expect(onMessage).toHaveBeenCalledExactlyOnceWith({ type: "ping" });
  });

  it("closes the previous renderer port when a new one replaces it", () => {
    const connection = createRendererConnection(vi.fn());
    const previous = new FakePort();
    const next = new FakePort();

    connection.adopt(previous);
    connection.adopt(next);

    expect(previous.closed).toBe(true);
    expect(next.closed).toBe(false);
  });

  it("ignores anything still arriving on a replaced port", () => {
    const onMessage = vi.fn();
    const connection = createRendererConnection(onMessage);
    const previous = new FakePort();

    connection.adopt(previous);
    connection.adopt(new FakePort());
    previous.receive({ type: "ping" });

    expect(onMessage).not.toHaveBeenCalled();
  });
});
