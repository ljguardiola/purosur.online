import type { QuarantinedEvent } from "@purosur/domain/sync/use-cases";
import { describe, expect, it, vi } from "vitest";
import { reportedQuarantines } from "./reported-quarantines.js";

const quarantinedEvent = (overrides: Partial<QuarantinedEvent> = {}): QuarantinedEvent => ({
  deviceId: "device-1",
  eventId: "event-1",
  eventType: "sale_print_state_changed",
  aggregateType: "Sale",
  aggregateId: "sale-1",
  error: "installation device-1 is not a known register",
  ...overrides,
});

describe("reportedQuarantines", () => {
  it("reports a quarantined event with its type, id, aggregate and last error", () => {
    const report = vi.fn();

    reportedQuarantines(report).quarantined(quarantinedEvent());

    expect(report).toHaveBeenCalledExactlyOnceWith(
      "sync: a synced event was quarantined",
      new Error("installation device-1 is not a known register"),
      {
        context: {
          deviceId: "device-1",
          eventId: "event-1",
          eventType: "sale_print_state_changed",
          aggregateType: "Sale",
          aggregateId: "sale-1",
        },
      },
    );
  });

  it("reports an error that only has a line starting with params, from no failed query, unchanged", () => {
    const report = vi.fn();

    reportedQuarantines(report).quarantined(
      quarantinedEvent({ error: "the event's payload was refused\nparams: missing aggregate id" }),
    );

    expect(report).toHaveBeenCalledExactlyOnceWith(
      "sync: a synced event was quarantined",
      new Error("the event's payload was refused\nparams: missing aggregate id"),
      expect.anything(),
    );
  });
});
