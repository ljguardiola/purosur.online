import { rendererPingMessageSchema } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { createMessageGate, summarizeRejection } from "./message-gate";

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

describe("summarizeRejection", () => {
  it("keeps the message type and where the message failed, but none of its values", () => {
    // Validation issues can echo the offending input back, as Zod's do when asked to.
    const issueEchoingInput = {
      path: ["cardNumber"],
      message: "Invalid input",
      input: "4111111111111111",
    };
    const summary = summarizeRejection({
      raw: { type: "sale", cardNumber: "4111111111111111" },
      issues: [issueEchoingInput],
    });

    expect(summary).toEqual({
      messageType: "sale",
      issues: [{ path: ["cardNumber"], message: "Invalid input" }],
    });
    expect(JSON.stringify(summary)).not.toContain("4111111111111111");
  });

  it.each([
    ["a string", "hello"],
    ["null", null],
    ["an object without a type", { cardNumber: "4111111111111111" }],
    ["an object whose type is not a string", { type: { nested: "secret" } }],
  ])("leaves the message type out when the message is %s", (_description, raw) => {
    const summary = summarizeRejection({ raw, issues: [] });

    expect(summary).toEqual({ messageType: undefined, issues: [] });
  });
});
