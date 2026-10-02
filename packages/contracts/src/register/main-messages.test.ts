import { describe, expect, it } from "vitest";
import { coreStatusMessageSchema, mainToCoreMessageSchema } from "./main-messages.js";

describe("mainToCoreMessageSchema", () => {
  it("accepts a health check", () => {
    expect(mainToCoreMessageSchema.safeParse({ type: "health-check" }).success).toBe(true);
  });

  it("rejects any other message type", () => {
    expect(mainToCoreMessageSchema.safeParse({ type: "ping" }).success).toBe(false);
    expect(mainToCoreMessageSchema.safeParse({}).success).toBe(false);
  });
});

describe("coreStatusMessageSchema", () => {
  it.each(["starting", "down", "up"])("accepts a core status of %s", (status) => {
    expect(coreStatusMessageSchema.safeParse({ type: "core-status", status }).success).toBe(true);
  });

  it("rejects a status outside starting, down and up", () => {
    expect(coreStatusMessageSchema.safeParse({ type: "core-status", status: "" }).success).toBe(
      false,
    );
    expect(coreStatusMessageSchema.safeParse({ type: "core-status" }).success).toBe(false);
  });

  it("rejects any other message type", () => {
    expect(coreStatusMessageSchema.safeParse({ type: "ping", status: "up" }).success).toBe(false);
    expect(coreStatusMessageSchema.safeParse({ status: "up" }).success).toBe(false);
  });
});
