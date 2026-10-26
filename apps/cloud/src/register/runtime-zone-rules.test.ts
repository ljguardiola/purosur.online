import { ARGENTINA_TIME_ZONE, offsetAt } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { runtimeZoneRules } from "./runtime-zone-rules.js";

function intlOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ARGENTINA_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
  const localAsUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return Math.round((localAsUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

describe("runtimeZoneRules", () => {
  const rules = runtimeZoneRules();

  it("is versioned with the time zone database of the runtime", () => {
    expect(rules.version).toBe(process.versions.tz);
  });

  it("starts at the beginning of the scanned years with its first offset", () => {
    expect(rules.transitions[0]).toEqual({
      from: new Date("1970-01-01T00:00:00.000Z"),
      offsetMinutes: -180,
    });
  });

  it("lists its transitions in the order they happen, each one changing the offset", () => {
    for (const [index, transition] of rules.transitions.entries()) {
      const previous = rules.transitions[index - 1];
      if (previous !== undefined) {
        expect(transition.from.getTime()).toBeGreaterThan(previous.from.getTime());
        expect(transition.offsetMinutes).not.toBe(previous.offsetMinutes);
      }
    }
  });

  it("puts each transition on the very minute the runtime's offset changes", () => {
    for (const { from, offsetMinutes } of rules.transitions.slice(1)) {
      expect(intlOffsetMinutes(from)).toBe(offsetMinutes);
      expect(intlOffsetMinutes(new Date(from.getTime() - 60_000))).not.toBe(offsetMinutes);
    }
  });

  it("gives the offset the runtime gives at any instant from 1970 to 2100", () => {
    for (
      let instant = Date.UTC(1970, 0, 1);
      instant < Date.UTC(2100, 0, 1);
      instant += 5 * 86_400_000 + 3_600_000
    ) {
      expect(offsetAt(rules, new Date(instant))).toBe(intlOffsetMinutes(new Date(instant)));
    }
  });

  it("keeps the summer time Argentina observed in 2008", () => {
    expect(offsetAt(rules, new Date("2009-01-15T12:00:00Z"))).toBe(-120);
    expect(offsetAt(rules, new Date("2009-06-15T12:00:00Z"))).toBe(-180);
  });

  it("keeps UTC-3 for the years the business operates in", () => {
    expect(offsetAt(rules, new Date("2026-10-26T12:00:00Z"))).toBe(-180);
    expect(offsetAt(rules, new Date("2100-01-01T00:00:00Z"))).toBe(-180);
  });
});
