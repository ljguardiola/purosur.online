import { describe, expect, it, vi } from "vitest";
import { handleRegisterQuit, isRegisterQuitMessage } from "./register-quit";

describe("isRegisterQuitMessage", () => {
  it("recognizes the message the core sends to ask the register to quit", () => {
    expect(isRegisterQuitMessage({ type: "quit-register" })).toBe(true);
    expect(isRegisterQuitMessage(structuredClone({ type: "quit-register" }))).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isRegisterQuitMessage({ type: "core-ready" })).toBe(false);
    expect(isRegisterQuitMessage("quit-register")).toBe(false);
    expect(isRegisterQuitMessage(null)).toBe(false);
    expect(isRegisterQuitMessage(undefined)).toBe(false);
    expect(isRegisterQuitMessage({})).toBe(false);
  });
});

describe("handling the core's message", () => {
  it("quits the register when the core asks it to", () => {
    const quit = vi.fn();

    handleRegisterQuit({ type: "quit-register" }, quit);

    expect(quit).toHaveBeenCalledTimes(1);
  });

  it("does not quit for any other message", () => {
    const quit = vi.fn();

    handleRegisterQuit({ type: "core-ready" }, quit);
    handleRegisterQuit(undefined, quit);

    expect(quit).not.toHaveBeenCalled();
  });
});
