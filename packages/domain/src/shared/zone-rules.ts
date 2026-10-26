export interface ZoneTransition {
  from: Date;
  offsetMinutes: number;
}

export interface ZoneRules {
  version: string | null;
  transitions: readonly ZoneTransition[];
}

export const FIXED_ARGENTINA_ZONE_RULES: ZoneRules = {
  version: null,
  transitions: [{ from: new Date(-8.64e15), offsetMinutes: -180 }],
};

export function offsetAt(rules: ZoneRules, instant: Date): number {
  let offsetMinutes = rules.transitions[0]?.offsetMinutes ?? 0;
  for (const transition of rules.transitions) {
    if (transition.from.getTime() > instant.getTime()) {
      break;
    }
    offsetMinutes = transition.offsetMinutes;
  }
  return offsetMinutes;
}

export function areZoneTransitionsOrdered(transitions: readonly ZoneTransition[]): boolean {
  return transitions.every(
    (transition, index) =>
      index === 0 || (transitions[index - 1]?.from.getTime() ?? 0) < transition.from.getTime(),
  );
}
