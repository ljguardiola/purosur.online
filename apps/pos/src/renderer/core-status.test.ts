import { describe, expect, it, vi } from "vitest";
import type { CoreStatusEvent, CoreStatusEventSource } from "./core-status";
import { attachCoreStatus } from "./core-status";

const ownWindow = { name: "own window" };
const otherWindow = { name: "another frame" };

class FakeSource implements CoreStatusEventSource {
  private listener: ((event: CoreStatusEvent) => void) | undefined;

  addEventListener(_type: "message", listener: (event: CoreStatusEvent) => void) {
    this.listener = listener;
  }

  removeEventListener(_type: "message", listener: (event: CoreStatusEvent) => void) {
    if (this.listener === listener) {
      this.listener = undefined;
    }
  }

  dispatch({ source = ownWindow, data }: { source?: unknown; data: unknown }): void {
    this.listener?.({ source, data });
  }
}

function coreStatusData(status: unknown): unknown {
  return { channel: "core-status", payload: { type: "core-status", status } };
}

describe("attachCoreStatus", () => {
  it("hands a valid down status to the callback", () => {
    const source = new FakeSource();
    const onStatus = vi.fn();

    attachCoreStatus(source, ownWindow, onStatus);
    source.dispatch({ data: coreStatusData("down") });

    expect(onStatus).toHaveBeenCalledExactlyOnceWith("down");
  });

  it("hands a valid up status to the callback", () => {
    const source = new FakeSource();
    const onStatus = vi.fn();

    attachCoreStatus(source, ownWindow, onStatus);
    source.dispatch({ data: coreStatusData("up") });

    expect(onStatus).toHaveBeenCalledExactlyOnceWith("up");
  });

  it("ignores a message posted by any window other than its own", () => {
    const source = new FakeSource();
    const onStatus = vi.fn();

    attachCoreStatus(source, ownWindow, onStatus);
    source.dispatch({ source: otherWindow, data: coreStatusData("down") });

    expect(onStatus).not.toHaveBeenCalled();
  });

  it("ignores a message on any other channel", () => {
    const source = new FakeSource();
    const onStatus = vi.fn();

    attachCoreStatus(source, ownWindow, onStatus);
    source.dispatch({ data: "core-port" });
    source.dispatch({
      data: { channel: "something-else", payload: { type: "core-status", status: "down" } },
    });

    expect(onStatus).not.toHaveBeenCalled();
  });

  it("ignores a payload that fails the core-status schema", () => {
    const source = new FakeSource();
    const onStatus = vi.fn();

    attachCoreStatus(source, ownWindow, onStatus);
    source.dispatch({ data: coreStatusData("sideways") });
    source.dispatch({ data: { channel: "core-status", payload: { type: "ping" } } });

    expect(onStatus).not.toHaveBeenCalled();
  });

  it("lets the caller detach and stop receiving status updates", () => {
    const source = new FakeSource();
    const onStatus = vi.fn();

    const detach = attachCoreStatus(source, ownWindow, onStatus);
    detach();
    source.dispatch({ data: coreStatusData("down") });

    expect(onStatus).not.toHaveBeenCalled();
  });
});
