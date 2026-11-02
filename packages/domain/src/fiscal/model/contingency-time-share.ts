import { addCalendarMonths, argentinaInstant, type ZoneRules } from "../../shared/index.js";
import { ARCA_REACHABILITY_HORIZON_MS } from "./arca-reachability.js";
import { flooredTenthsOfPercent } from "./exception-share.js";

export const CONTINGENCY_TIME_NON_COMPLIANCE_PERCENT = 5;
const PERCENT = 100;

export const CONTINGENCY_TIME_MONTH_STATES = [
  "non_compliant",
  "compliant",
  "in_progress",
  "no_data",
] as const;

type ContingencyTimeMonthState = (typeof CONTINGENCY_TIME_MONTH_STATES)[number];

export interface TimeSpan {
  start: Date;
  end: Date;
}

export interface ArcaAvailabilityRun {
  ok: boolean;
  firstCheckedAt: Date;
  lastCheckedAt: Date;
}

export interface ContingencyPart {
  registerId: string;
  start: Date;
  end: Date | null;
}

export interface ContingencyReportingRegister {
  registerId: string;
  reportingSince: Date | null;
  presence: TimeSpan[];
}

export interface ContingencyTimeMeasurement {
  contingencyMs: number;
  availableMs: number;
  shareTenthsOfPercent: number | null;
  state: ContingencyTimeMonthState;
}

interface Millis {
  start: number;
  end: number;
}

function millisOf({ start, end }: TimeSpan): Millis {
  return { start: start.getTime(), end: end.getTime() };
}

function spansOfRuns(runs: readonly ArcaAvailabilityRun[]): (Millis & { ok: boolean })[] {
  const sorted = [...runs].sort((a, b) => a.firstCheckedAt.getTime() - b.firstCheckedAt.getTime());
  return sorted.map(({ ok, firstCheckedAt, lastCheckedAt }, index) => {
    const next = sorted[index + 1];
    const heldUntil = lastCheckedAt.getTime() + ARCA_REACHABILITY_HORIZON_MS;
    return {
      ok,
      start: firstCheckedAt.getTime(),
      end: next === undefined ? heldUntil : Math.min(heldUntil, next.firstCheckedAt.getTime()),
    };
  });
}

function unionOf(spans: readonly Millis[]): Millis[] {
  const sorted = spans.filter(({ start, end }) => start < end).sort((a, b) => a.start - b.start);
  const united: Millis[] = [];
  for (const span of sorted) {
    const last = united[united.length - 1];
    if (last !== undefined && span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
    } else {
      united.push({ ...span });
    }
  }
  return united;
}

function clippedTo<T extends Millis>(spans: readonly T[], bounds: Millis): T[] {
  return spans.map((span) => ({
    ...span,
    start: Math.max(span.start, bounds.start),
    end: Math.min(span.end, bounds.end),
  }));
}

function lengthOf(spans: readonly Millis[]): number {
  return spans.reduce((total, { start, end }) => total + Math.max(0, end - start), 0);
}

function intersectionLength(a: readonly Millis[], b: readonly Millis[]): number {
  return a.reduce(
    (total, spanA) =>
      total +
      b.reduce(
        (subtotal, spanB) =>
          subtotal +
          Math.max(0, Math.min(spanA.end, spanB.end) - Math.max(spanA.start, spanB.start)),
        0,
      ),
    0,
  );
}

export function arcaAvailableSpans(runs: readonly ArcaAvailabilityRun[]): TimeSpan[] {
  return unionOf(spansOfRuns(runs).filter(({ ok }) => ok)).map(({ start, end }) => ({
    start: new Date(start),
    end: new Date(end),
  }));
}

export function monthWindow(month: string, rules: ZoneRules): TimeSpan {
  const first = `${month}-01`;
  const instantOf = (day: string) => new Date(argentinaInstant(day, "00:00", rules));
  return { start: instantOf(first), end: instantOf(addCalendarMonths(first, 1)) };
}

function firstReportingIsLate(
  { reportingSince, presence }: ContingencyReportingRegister,
  window: Millis,
): boolean {
  const stays = clippedTo(presence.map(millisOf), window).filter(({ start, end }) => start < end);
  if (stays.length === 0) {
    return false;
  }
  const countsFrom = Math.min(...stays.map(({ start }) => start));
  return reportingSince === null || reportingSince.getTime() > countsFrom;
}

function stateOf({
  hasData,
  reportingIsComplete,
  closed,
  contingencyMs,
  availableMs,
}: {
  hasData: boolean;
  reportingIsComplete: boolean;
  closed: boolean;
  contingencyMs: number;
  availableMs: number;
}): ContingencyTimeMonthState {
  if (!hasData || !reportingIsComplete) {
    return "no_data";
  }
  if (!closed) {
    return "in_progress";
  }
  return contingencyMs * PERCENT > availableMs * CONTINGENCY_TIME_NON_COMPLIANCE_PERCENT
    ? "non_compliant"
    : "compliant";
}

export function contingencyTimeMeasurement({
  window,
  now,
  closed,
  runs,
  parts,
  registers,
}: {
  window: TimeSpan;
  now: Date;
  closed: boolean;
  runs: readonly ArcaAvailabilityRun[];
  parts: readonly ContingencyPart[];
  registers: readonly ContingencyReportingRegister[];
}): ContingencyTimeMeasurement {
  const nowMs = now.getTime();
  const measured = {
    start: window.start.getTime(),
    end: Math.min(window.end.getTime(), nowMs),
  };
  const answered = clippedTo(spansOfRuns(runs), measured).filter(({ start, end }) => start < end);
  const available = clippedTo(arcaAvailableSpans(runs).map(millisOf), measured);
  const contingency = unionOf(
    clippedTo(
      parts.map(({ start, end }) => ({
        start: start.getTime(),
        end: end === null ? nowMs : end.getTime(),
      })),
      measured,
    ),
  );
  const availableMs = lengthOf(available);
  const contingencyMs = intersectionLength(contingency, available);
  const state = stateOf({
    hasData: answered.length > 0,
    reportingIsComplete: !registers.some((each) =>
      firstReportingIsLate(each, { start: measured.start, end: window.end.getTime() }),
    ),
    closed,
    contingencyMs,
    availableMs,
  });
  return {
    contingencyMs,
    availableMs,
    shareTenthsOfPercent:
      state === "no_data" ? null : flooredTenthsOfPercent(contingencyMs, availableMs),
    state,
  };
}
