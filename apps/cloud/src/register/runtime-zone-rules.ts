import { ARGENTINA_TIME_ZONE, type ZoneTransition } from "@purosur/domain";

const SCAN_FROM = Date.UTC(1970, 0, 1);
const SCAN_UNTIL = Date.UTC(2100, 0, 1);
const SCAN_STEP_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const OFFSET_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: ARGENTINA_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function offsetMinutesAt(instantMs: number): number {
  const parts = OFFSET_FORMAT.formatToParts(new Date(instantMs));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  const localAsUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return Math.round((localAsUtc - Math.floor(instantMs / 1000) * 1000) / MINUTE_MS);
}

function firstMinuteWithOffset(lastBeforeMs: number, changedAtMs: number, offset: number): number {
  let before = lastBeforeMs;
  let after = changedAtMs;
  while (after - before > MINUTE_MS) {
    const middle = before + Math.floor((after - before) / MINUTE_MS / 2) * MINUTE_MS;
    if (offsetMinutesAt(middle) === offset) {
      after = middle;
    } else {
      before = middle;
    }
  }
  return after;
}

export function runtimeZoneRules(): { version: string; transitions: ZoneTransition[] } {
  const version = process.versions["tz"];
  if (version === undefined) {
    throw new Error("the runtime reports no version of its time zone database");
  }
  let offset = offsetMinutesAt(SCAN_FROM);
  const transitions: ZoneTransition[] = [{ from: new Date(SCAN_FROM), offsetMinutes: offset }];
  for (let at = SCAN_FROM + SCAN_STEP_MS; at <= SCAN_UNTIL; at += SCAN_STEP_MS) {
    const scanned = offsetMinutesAt(at);
    if (scanned !== offset) {
      transitions.push({
        from: new Date(firstMinuteWithOffset(at - SCAN_STEP_MS, at, scanned)),
        offsetMinutes: scanned,
      });
      offset = scanned;
    }
  }
  return { version, transitions };
}
