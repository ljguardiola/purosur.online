import { FICTIONAL_CUIT, FICTIONAL_LEGAL_NAME } from "@purosur/domain/fiscal/test-support";
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

  it("reports a failed query's statement without the values it was given", () => {
    const report = vi.fn();

    reportedQuarantines(report).quarantined(
      quarantinedEvent({
        error: `Failed query: insert into "customers" ("cuit", "name") values ($1, $2)\nparams: ${FICTIONAL_CUIT},${FICTIONAL_LEGAL_NAME}`,
      }),
    );

    expect(report).toHaveBeenCalledExactlyOnceWith(
      "sync: a synced event was quarantined",
      new Error('Failed query: insert into "customers" ("cuit", "name") values ($1, $2)'),
      expect.anything(),
    );
    const reported = JSON.stringify(report.mock.calls, (_key, value: unknown) =>
      value instanceof Error ? value.message : value,
    );
    expect(reported).not.toContain(FICTIONAL_CUIT);
    expect(reported).not.toContain(FICTIONAL_LEGAL_NAME);
  });
});
