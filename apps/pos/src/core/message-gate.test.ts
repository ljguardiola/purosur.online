import { rendererPingMessageSchema } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { createMessageGate } from "./message-gate";

describe("createMessageGate", () => {
  it("lets a message that matches its schema reach the handler", () => {
    const recorder = { recordRejection: vi.fn() };
    const gate = createMessageGate(rendererPingMessageSchema, recorder);
    const handler = vi.fn();

    gate({ type: "ping" }, handler);

    expect(handler).toHaveBeenCalledExactlyOnceWith({ type: "ping" });
    expect(recorder.recordRejection).not.toHaveBeenCalled();
  });

  it("discards a message that fails its schema and records the rejection with enough detail", () => {
    const recorder = { recordRejection: vi.fn() };
    const gate = createMessageGate(rendererPingMessageSchema, recorder);
    const handler = vi.fn();

    gate({ type: 42 }, handler);

    expect(handler).not.toHaveBeenCalled();
    expect(recorder.recordRejection).toHaveBeenCalledExactlyOnceWith({
      raw: { type: 42 },
      issues: [expect.objectContaining({ path: ["type"], message: expect.any(String) })],
    });
  });

  it("rejects a message carrying an unknown message type", () => {
    const recorder = { recordRejection: vi.fn() };
    const gate = createMessageGate(rendererPingMessageSchema, recorder);
    const handler = vi.fn();

    gate({ type: "not-a-real-message" }, handler);

    expect(handler).not.toHaveBeenCalled();
    expect(recorder.recordRejection).toHaveBeenCalledExactlyOnceWith({
      raw: { type: "not-a-real-message" },
      issues: [expect.objectContaining({ path: ["type"] })],
    });
  });
});
