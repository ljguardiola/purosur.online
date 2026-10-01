import { describe, expect, it } from "vitest";
import { PUSH_BATCH_MAX_EVENTS } from "./push-batch.js";

describe("push batch", () => {
  it("carries at most 200 events", () => {
    expect(PUSH_BATCH_MAX_EVENTS).toBe(200);
  });
});
