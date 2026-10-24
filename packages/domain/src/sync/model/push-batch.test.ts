import { describe, expect, expectTypeOf, it } from "vitest";
import { PUSH_BATCH_MAX_EVENTS, type RegisterTelemetry } from "./push-batch.js";

describe("push batch", () => {
  it("carries at most 200 events", () => {
    expect(PUSH_BATCH_MAX_EVENTS).toBe(200);
  });
});

describe("RegisterTelemetry", () => {
  it("lets a register report that its replenishment has not failed, how it failed, or nothing", () => {
    expectTypeOf<RegisterTelemetry["replenishment_failed"]>().toEqualTypeOf<
      false | "refused" | "unreadable_event" | undefined
    >();
  });
});
