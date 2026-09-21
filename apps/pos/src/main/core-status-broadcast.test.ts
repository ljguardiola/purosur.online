import { describe, expect, it, vi } from "vitest";
import { broadcastCoreStatus } from "./core-status-broadcast";

describe("broadcastCoreStatus", () => {
  it("posts a validated down message on the core-status channel", () => {
    const postMessage = vi.fn();

    broadcastCoreStatus({ postMessage }, "down");

    expect(postMessage).toHaveBeenCalledExactlyOnceWith("core-status", {
      type: "core-status",
      status: "down",
    });
  });

  it("posts a validated up message on the core-status channel", () => {
    const postMessage = vi.fn();

    broadcastCoreStatus({ postMessage }, "up");

    expect(postMessage).toHaveBeenCalledExactlyOnceWith("core-status", {
      type: "core-status",
      status: "up",
    });
  });
});
