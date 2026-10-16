import { describe, expect, it } from "vitest";
import {
  CLOCK_CORRECTED_EVENT_TYPE,
  clockCorrectedEvent,
  clockCorrectionPeriodKey,
  clockLoweringsFor,
} from "./clock-correction.js";

const READING = new Date("2026-10-01T12:00:00.000Z");
const ahead = (ms: number) => new Date(READING.getTime() + ms);

describe("clockLoweringsFor", () => {
  it("lowers each series whose mark is more than a minute ahead of the reading, to the reading", () => {
    const marks = [
      { pointOfSale: 12, documentType: "factura_c", reading: ahead(60_001) },
      { pointOfSale: 7, documentType: "factura_c", reading: ahead(3_600_000) },
    ] as const;

    expect(clockLoweringsFor(marks, READING)).toEqual([
      {
        pointOfSale: 12,
        documentType: "factura_c",
        previousReading: ahead(60_001),
        correctedReading: READING,
      },
      {
        pointOfSale: 7,
        documentType: "factura_c",
        previousReading: ahead(3_600_000),
        correctedReading: READING,
      },
    ]);
  });

  it("leaves a series whose mark is within a minute of the reading, or behind it, as it is", () => {
    const marks = [
      { pointOfSale: 12, documentType: "factura_c", reading: ahead(60_000) },
      { pointOfSale: 7, documentType: "factura_c", reading: ahead(-5_000) },
    ] as const;

    expect(clockLoweringsFor(marks, READING)).toEqual([]);
  });
});

describe("clockCorrectionPeriodKey", () => {
  it("is the open cash session while one is open", () => {
    expect(
      clockCorrectionPeriodKey({ openSessionId: "session-2", lastClosedSessionId: "s-1" }),
    ).toBe("session-2");
  });

  it("is the period after the last closed session while none is open", () => {
    expect(
      clockCorrectionPeriodKey({ openSessionId: null, lastClosedSessionId: "session-1" }),
    ).toBe("after session session-1");
  });

  it("is the period before any session while none was ever opened", () => {
    expect(clockCorrectionPeriodKey({ openSessionId: null, lastClosedSessionId: null })).toBe(
      "after session none",
    );
  });
});

describe("clockCorrectedEvent", () => {
  it("records the lowering of a point of sale's mark against the register, by whoever did it", () => {
    expect(
      clockCorrectedEvent({
        eventId: "event-1",
        registerId: "register-1",
        actorId: "user-1",
        lowering: {
          pointOfSale: 12,
          documentType: "factura_c",
          previousReading: ahead(3_600_000),
          correctedReading: READING,
        },
      }),
    ).toEqual({
      event_id: "event-1",
      aggregate_type: "CashRegister",
      aggregate_id: "register-1",
      event_type: "clock_corrected",
      schema_version: 1,
      payload: {
        point_of_sale: 12,
        document_type: "factura_c",
        previous_reading: "2026-10-01T13:00:00.000Z",
        corrected_reading: "2026-10-01T12:00:00.000Z",
      },
      occurred_at: "2026-10-01T12:00:00.000Z",
      actor_id: "user-1",
    });
  });

  it("names its event type", () => {
    expect(CLOCK_CORRECTED_EVENT_TYPE).toBe("clock_corrected");
  });
});
