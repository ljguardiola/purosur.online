import { formatDate } from "@purosur/ui";

export function reportMoment(instant: string, timeZone: string): { date: string; time: string } {
  const moment = new Date(instant);
  return {
    date: formatDate(moment, { day: "2-digit", month: "2-digit", year: "numeric", timeZone }),
    time: formatDate(moment, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }),
  };
}
