import { describe, expect, it, vi } from "vitest";
import { establishCoreConnection } from "./core-connection";

describe("establishCoreConnection", () => {
  it("sends one end of a fresh channel to the core and the other to the renderer", () => {
    const createChannel = vi.fn(() => ({ port1: "core-side", port2: "renderer-side" }));
    const sendToCore = vi.fn();
    const sendToRenderer = vi.fn();

    establishCoreConnection({ createChannel, sendToCore, sendToRenderer });

    expect(sendToCore).toHaveBeenCalledExactlyOnceWith("core-side");
    expect(sendToRenderer).toHaveBeenCalledExactlyOnceWith("renderer-side");
  });

  it("creates a brand new channel on every call instead of reusing one", () => {
    let created = 0;
    const createChannel = vi.fn(() => {
      created += 1;
      return { port1: `core-${created}`, port2: `renderer-${created}` };
    });
    const sendToCore = vi.fn();
    const sendToRenderer = vi.fn();

    establishCoreConnection({ createChannel, sendToCore, sendToRenderer });
    establishCoreConnection({ createChannel, sendToCore, sendToRenderer });

    expect(createChannel).toHaveBeenCalledTimes(2);
    expect(sendToCore).toHaveBeenNthCalledWith(1, "core-1");
    expect(sendToCore).toHaveBeenNthCalledWith(2, "core-2");
    expect(sendToRenderer).toHaveBeenNthCalledWith(1, "renderer-1");
    expect(sendToRenderer).toHaveBeenNthCalledWith(2, "renderer-2");
  });
});
