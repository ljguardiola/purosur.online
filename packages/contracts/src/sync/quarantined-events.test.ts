import { describe, expect, it } from "vitest";
import {
  quarantinedEventsListSchema,
  releaseQuarantinedEventErrorSchema,
} from "./quarantined-events.js";

const listed = {
  eventId: "0199b7a0-0000-7000-8000-000000000001",
  registerName: "Caja 1",
  aggregateType: "Sale",
  aggregateId: "0199b7a0-0000-7000-8000-000000000002",
  eventType: "sale_completed",
  receivedAt: "2026-10-07T10:00:05.000Z",
  quarantinedAt: "2026-10-07T12:00:00.000Z",
  lastError: "product p-1 is not in the catalog",
};

describe("the quarantined events list", () => {
  it("holds the events with what an Administrator needs to tell them apart", () => {
    expect(quarantinedEventsListSchema.parse({ events: [listed] })).toEqual({ events: [listed] });
  });

  it("accepts no events", () => {
    expect(quarantinedEventsListSchema.parse({ events: [] })).toEqual({ events: [] });
  });

  it("accepts an event whose last error was not kept", () => {
    expect(
      quarantinedEventsListSchema.safeParse({ events: [{ ...listed, lastError: null }] }).success,
    ).toBe(true);
  });

  it.each(Object.keys(listed))("refuses an event without its %s", (field) => {
    const { [field]: _removed, ...incomplete } = listed as Record<string, string>;

    expect(quarantinedEventsListSchema.safeParse({ events: [incomplete] }).success).toBe(false);
  });

  it("refuses a time that is not an ISO instant", () => {
    expect(
      quarantinedEventsListSchema.safeParse({ events: [{ ...listed, receivedAt: "yesterday" }] })
        .success,
    ).toBe(false);
  });

  it("refuses a body that is not an object with the events", () => {
    expect(quarantinedEventsListSchema.safeParse([listed]).success).toBe(false);
  });
});

describe("the release refusals", () => {
  it.each(["not_found", "not_quarantined"])("accepts %s with its message", (code) => {
    const body = { code, message: "no event in quarantine with that id" };

    expect(releaseQuarantinedEventErrorSchema.parse(body)).toEqual(body);
  });

  it("refuses any other code", () => {
    expect(
      releaseQuarantinedEventErrorSchema.safeParse({ code: "teapot", message: "x" }).success,
    ).toBe(false);
  });

  it("refuses a refusal without a message", () => {
    expect(releaseQuarantinedEventErrorSchema.safeParse({ code: "not_found" }).success).toBe(false);
  });
});
