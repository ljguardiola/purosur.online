export interface Fortnight {
  start: string;
  end: string;
}

export const OFFLINE_AUTHORIZATION_CODE_REQUEST_LEAD_DAYS = 5;

const SECOND_HALF_FIRST_DAY = 16;
const DAY_MS = 24 * 60 * 60 * 1000;

function dayOf(year: number, monthIndex: number, day: number): string {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

function shiftedBy(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function fortnightContaining(day: string): Fortnight {
  const date = new Date(`${day}T00:00:00Z`);
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth();
  if (date.getUTCDate() < SECOND_HALF_FIRST_DAY) {
    return {
      start: dayOf(year, monthIndex, 1),
      end: dayOf(year, monthIndex, SECOND_HALF_FIRST_DAY - 1),
    };
  }
  return {
    start: dayOf(year, monthIndex, SECOND_HALF_FIRST_DAY),
    end: dayOf(year, monthIndex + 1, 0),
  };
}

export function fortnightAfter({ end }: Fortnight): Fortnight {
  return fortnightContaining(shiftedBy(end, 1));
}

export function offlineAuthorizationCodeRequestOpensOn({ start }: Fortnight): string {
  return shiftedBy(start, -OFFLINE_AUTHORIZATION_CODE_REQUEST_LEAD_DAYS);
}

export function fortnightsWithinRequestWindowOn(day: string): Fortnight[] {
  const current = fortnightContaining(day);
  const next = fortnightAfter(current);
  return offlineAuthorizationCodeRequestOpensOn(next) <= day ? [current, next] : [current];
}
