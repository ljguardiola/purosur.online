import { ARGENTINA_TIME_ZONE } from "@purosur/domain";

const MINUTE_MS = 60_000;

const ARGENTINA_OFFSET = new Intl.DateTimeFormat("en-US", {
  timeZone: ARGENTINA_TIME_ZONE,
  timeZoneName: "longOffset",
});

function argentinaOffsetAt(instant: Date): string {
  const name = ARGENTINA_OFFSET.formatToParts(instant).find(
    (part) => part.type === "timeZoneName",
  )?.value;
  return name === undefined || name === "GMT" ? "+00:00" : name.slice("GMT".length);
}

export function inArgentinaTime(instant: Date): string {
  const offset = argentinaOffsetAt(instant);
  const sign = offset.startsWith("-") ? -1 : 1;
  const minutes = sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6)));
  const clock = new Date(instant.getTime() + minutes * MINUTE_MS).toISOString().slice(0, -1);
  return `${clock}${offset}`;
}
