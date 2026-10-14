import type { Tone } from "@purosur/ui";
import { formatCalendarDayNumeric, formatDate } from "@purosur/ui";
import type { FortnightPresentation } from "./fortnight-presentations-api";

type Fortnight = FortnightPresentation["fortnight"];

function dayOfMonth(day: string): string {
  return formatDate(Date.parse(`${day}T00:00:00Z`), { day: "numeric", timeZone: "UTC" });
}

const DAY_AND_MONTH_LENGTH = "dd/mm".length;

export function fortnightLabel({ start, end }: Fortnight): string {
  return `${dayOfMonth(start)} al ${formatCalendarDayNumeric(end)}`;
}

export function fortnightShortLabel({ start, end }: Fortnight): string {
  return `${dayOfMonth(start)} al ${formatCalendarDayNumeric(end).slice(0, DAY_AND_MONTH_LENGTH)}`;
}

const STATE_BADGES: Record<
  NonNullable<FortnightPresentation["state"]> | "pending",
  { label: string; tone: Tone }
> = {
  pending: { label: "Pendiente", tone: "warning" },
  ready: { label: "Listo para presentar", tone: "warning" },
  submitting: { label: "Presentando", tone: "info" },
  refused: { label: "Rechazado", tone: "error" },
  blocked: { label: "Bloqueado", tone: "error" },
  accepted: { label: "Aceptado", tone: "success" },
};

export function presentationStateBadge(state: FortnightPresentation["state"]) {
  return STATE_BADGES[state ?? "pending"];
}
