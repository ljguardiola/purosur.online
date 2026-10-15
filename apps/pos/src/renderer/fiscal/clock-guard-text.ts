import type { ReadClockGuardOutcome } from "@purosur/contracts";
import { formatCalendarDayNumeric, formatDate, formatPointOfSaleNumber } from "@purosur/ui";

type ClockGuardBlock = Extract<ReadClockGuardOutcome, { kind: "read" }>["blocks"][number];

type LastDocument = { pointOfSale: number; text: string };

export function clockReadingText(instant: string): string {
  const moment = new Date(instant);
  const day = formatDate(moment, { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = formatDate(moment, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${day} · ${time}`;
}

function latestOf<Value>(
  candidates: readonly Value[],
  isLater: (candidate: Value, best: Value) => boolean,
): Value | undefined {
  return candidates.reduce<Value | undefined>(
    (best, candidate) => (best === undefined || isLater(candidate, best) ? candidate : best),
    undefined,
  );
}

export function lastDocumentOf(blocks: readonly ClockGuardBlock[]): LastDocument | undefined {
  const withReading = blocks.filter((block) => block.latest_reading !== null);
  const byReading = latestOf(
    withReading,
    (candidate, best) =>
      Date.parse(candidate.latest_reading ?? "") > Date.parse(best.latest_reading ?? ""),
  );
  if (byReading?.latest_reading != null) {
    return {
      pointOfSale: byReading.point_of_sale,
      text: clockReadingText(byReading.latest_reading),
    };
  }
  const byDay = latestOf(
    blocks.filter((block) => block.tax_authority_last_authorized_issued_on !== null),
    (candidate, best) =>
      (candidate.tax_authority_last_authorized_issued_on ?? "") >
      (best.tax_authority_last_authorized_issued_on ?? ""),
  );
  return byDay?.tax_authority_last_authorized_issued_on == null
    ? undefined
    : {
        pointOfSale: byDay.point_of_sale,
        text: formatCalendarDayNumeric(byDay.tax_authority_last_authorized_issued_on),
      };
}

export function modalEyebrow(registerName: string | null, pointOfSale: number): string {
  const pointOfSaleText = `Punto de venta ${formatPointOfSaleNumber(pointOfSale)}`;
  return registerName === null ? pointOfSaleText : `${registerName} · ${pointOfSaleText}`;
}
