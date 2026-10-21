import { describe, expect, it } from "vitest";
import {
  CLOCK_CORRECTED_EVENT_TYPE,
  clockCorrectedEvent,
  clockCorrectionPeriodKey,
  clockLoweringsFor,
} from "./clock-correction.js";

const READING = new Date("2026-10-01T12:00:00.000Z");
const ahead = (ms: number) => new Date(READING.getTime() + ms);
const START_OF_TAX_AUTHORITY_DAY = new Date("2026-10-02T03:00:00.000Z");
const FLOOR = {
  pointOfSale: 12,
  documentType: "factura_c",
  lastIssuedOn: "2026-10-02",
  corrections: [],
} as const;

describe("clockLoweringsFor", () => {
  it("lowers each series whose mark is more than a minute ahead of the reading, to the reading", () => {
    const marks = [
      { pointOfSale: 12, documentType: "factura_c", reading: ahead(60_001) },
      { pointOfSale: 7, documentType: "factura_c", reading: ahead(3_600_000) },
    ] as const;

    expect(clockLoweringsFor(marks, READING, null)).toEqual([
      {
        pointOfSale: 12,
        documentType: "factura_c",
        previousReading: ahead(60_001),
        previousReadingSource: "clock_mark",
        correctedReading: READING,
      },
      {
        pointOfSale: 7,
        documentType: "factura_c",
        previousReading: ahead(3_600_000),
        previousReadingSource: "clock_mark",
        correctedReading: READING,
      },
    ]);
  });

  it("leaves a series whose mark is within a minute of the reading, or behind it, as it is", () => {
    const marks = [
      { pointOfSale: 12, documentType: "factura_c", reading: ahead(60_000) },
      { pointOfSale: 7, documentType: "factura_c", reading: ahead(-5_000) },
    ] as const;

    expect(clockLoweringsFor(marks, READING, null)).toEqual([]);
  });
});

describe("clockLoweringsFor against the tax authority's last authorized day", () => {
  it("lowers a series with no mark from the start of the tax authority's day, which is not a reading the register showed", () => {
    expect(clockLoweringsFor([], READING, FLOOR)).toEqual([
      {
        pointOfSale: 12,
        documentType: "factura_c",
        previousReading: START_OF_TAX_AUTHORITY_DAY,
        previousReadingSource: "tax_authority_day",
        correctedReading: READING,
      },
    ]);
  });

  it("lowers from the mark when the mark of that series is later than the start of the day", () => {
    const mark = {
      pointOfSale: 12,
      documentType: "factura_c",
      reading: new Date("2026-10-02T15:00:00.000Z"),
    } as const;

    expect(clockLoweringsFor([mark], READING, FLOOR)).toEqual([
      {
        pointOfSale: 12,
        documentType: "factura_c",
        previousReading: mark.reading,
        previousReadingSource: "clock_mark",
        correctedReading: READING,
      },
    ]);
  });

  it("lowers once from the start of the day when the series' mark is ahead of the reading but earlier than that start", () => {
    const mark = {
      pointOfSale: 12,
      documentType: "factura_c",
      reading: new Date("2026-10-02T01:00:00.000Z"),
    } as const;

    expect(clockLoweringsFor([mark], READING, FLOOR)).toEqual([
      {
        pointOfSale: 12,
        documentType: "factura_c",
        previousReading: START_OF_TAX_AUTHORITY_DAY,
        previousReadingSource: "tax_authority_day",
        correctedReading: READING,
      },
    ]);
  });

  it("keeps the lowering of another series' mark beside the floor's", () => {
    const other = { pointOfSale: 7, documentType: "factura_c", reading: ahead(3_600_000) } as const;

    expect(clockLoweringsFor([other], READING, FLOOR)).toEqual([
      {
        pointOfSale: 7,
        documentType: "factura_c",
        previousReading: other.reading,
        previousReadingSource: "clock_mark",
        correctedReading: READING,
      },
      {
        pointOfSale: 12,
        documentType: "factura_c",
        previousReading: START_OF_TAX_AUTHORITY_DAY,
        previousReadingSource: "tax_authority_day",
        correctedReading: READING,
      },
    ]);
  });

  it("does not take another document type's mark of the same point of sale for the floor's series", () => {
    const otherType = {
      pointOfSale: 12,
      documentType: "nota_credito_c",
      reading: ahead(3_600_000),
    } as const;

    expect(clockLoweringsFor([otherType], READING, FLOOR)).toHaveLength(2);
  });

  it("lowers nothing for the floor when the reading is on the tax authority's day", () => {
    const onTheDay = new Date("2026-10-02T12:00:00.000Z");

    expect(clockLoweringsFor([], onTheDay, FLOOR)).toEqual([]);
  });

  it("lowers nothing for the floor when a correction already opened the lapse", () => {
    const corrections = [
      { previousReading: new Date("2026-10-02T15:00:00.000Z"), correctedReading: READING },
    ];

    expect(clockLoweringsFor([], READING, { ...FLOOR, corrections })).toEqual([]);
  });

  it("lowers from the start of the day again when the only correction belongs to an earlier episode", () => {
    const corrections = [
      { previousReading: new Date("2026-09-20T15:00:00.000Z"), correctedReading: READING },
    ];

    expect(clockLoweringsFor([], READING, { ...FLOOR, corrections })).toHaveLength(1);
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
          previousReadingSource: "clock_mark",
          correctedReading: READING,
        },
      }),
    ).toEqual({
      event_id: "event-1",
      aggregate_type: "CashRegister",
      aggregate_id: "register-1",
      event_type: "clock_corrected",
      schema_version: 2,
      payload: {
        point_of_sale: 12,
        document_type: "factura_c",
        previous_reading: "2026-10-01T13:00:00.000Z",
        previous_reading_source: "clock_mark",
        corrected_reading: "2026-10-01T12:00:00.000Z",
      },
      occurred_at: "2026-10-01T12:00:00.000Z",
      actor_id: "user-1",
    });
  });

  it("records the start of the tax authority's day as the source of a derived previous reading", () => {
    const event = clockCorrectedEvent({
      eventId: "event-1",
      registerId: "register-1",
      actorId: "user-1",
      lowering: {
        pointOfSale: 12,
        documentType: "factura_c",
        previousReading: START_OF_TAX_AUTHORITY_DAY,
        previousReadingSource: "tax_authority_day",
        correctedReading: READING,
      },
    });

    expect(event.payload).toMatchObject({
      previous_reading: "2026-10-02T03:00:00.000Z",
      previous_reading_source: "tax_authority_day",
    });
  });

  it("names its event type", () => {
    expect(CLOCK_CORRECTED_EVENT_TYPE).toBe("clock_corrected");
  });
});
