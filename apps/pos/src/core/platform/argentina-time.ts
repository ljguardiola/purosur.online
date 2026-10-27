import { localClock, offsetAt, utcOffsetText, type ZoneRules } from "@purosur/domain";

export function inArgentinaTime(instant: Date, rules: ZoneRules): string {
  const clock = localClock(instant, rules).toISOString().slice(0, -1);
  return `${clock}${utcOffsetText(offsetAt(rules, instant))}`;
}
