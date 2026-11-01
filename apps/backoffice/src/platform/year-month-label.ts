import {
  formatMonthAndYear,
  formatMonthAndYearInSentence,
  formatMonthNameInSentence,
  formatYear,
} from "@purosur/ui";

function parseYearMonth(yearMonth: string): { year: number; month: number } | undefined {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(yearMonth);
  return match === null ? undefined : { year: Number(match[1]), month: Number(match[2]) };
}

export function yearMonthLabel(yearMonth: string): string {
  const parsed = parseYearMonth(yearMonth);
  return parsed === undefined ? yearMonth : formatMonthAndYear(parsed.year, parsed.month);
}

export function monthNameOf(yearMonth: string): string {
  const parsed = parseYearMonth(yearMonth);
  return parsed === undefined ? yearMonth : formatMonthNameInSentence(parsed.month);
}

export function yearMonthPhrase(yearMonth: string): string {
  const parsed = parseYearMonth(yearMonth);
  return parsed === undefined ? yearMonth : formatMonthAndYearInSentence(parsed.year, parsed.month);
}

export function yearOf(yearMonth: string): string {
  const parsed = parseYearMonth(yearMonth);
  return parsed === undefined ? yearMonth : formatYear(parsed.year);
}
