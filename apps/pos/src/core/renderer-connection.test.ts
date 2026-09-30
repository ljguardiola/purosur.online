import { describe, expect, it, vi } from "vitest";
import { createRendererConnection, type RendererPort } from "./renderer-connection";

class FakePort implements RendererPort {
  started = false;
  closed = false;
  posted: unknown[] = [];
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

  postMessage(message: unknown): void {
    this.posted.push(message);
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
    expect(onMessage).toHaveBeenCalledExactlyOnceWith({ type: "ping" }, expect.any(Function));
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

  it("answers on the port the message arrived on", () => {
    const connection = createRendererConnection((_data, reply) => reply({ type: "answer" }));
    const port = new FakePort();

    connection.adopt(port);
    port.receive({ type: "ping" });

    expect(port.posted).toEqual([{ type: "answer" }]);
  });

  it("drops an answer whose port was replaced before it was ready", () => {
    const replies: ((message: unknown) => void)[] = [];
    const connection = createRendererConnection((_data, reply) => replies.push(reply));
    const previous = new FakePort();
    const next = new FakePort();

    connection.adopt(previous);
    previous.receive({ type: "ping" });
    connection.adopt(next);
    replies[0]?.({ type: "late answer" });

    expect(previous.posted).toEqual([]);
    expect(next.posted).toEqual([]);
  });

  it("tells the live page something it didn't ask about", () => {
    const connection = createRendererConnection(vi.fn());
    const previous = new FakePort();
    const next = new FakePort();

    connection.adopt(previous);
    connection.adopt(next);
    connection.tell({ type: "pulled" });

    expect(next.posted).toEqual([{ type: "pulled" }]);
    expect(previous.posted).toEqual([]);
  });

  it("tells nothing before any page has connected", () => {
    const connection = createRendererConnection(vi.fn());

    expect(() => connection.tell({ type: "pulled" })).not.toThrow();
  });
});
