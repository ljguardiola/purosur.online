import { describe, expect, it } from "vitest";
import { syncCoreToRendererMessageSchema } from "./core-messages.js";

describe("syncCoreToRendererMessageSchema", () => {
  it("accepts the notice that a pull finished, which answers no request", () => {
    const message = { type: "pulled" };

    expect(syncCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });
});
