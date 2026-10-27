import type { ZoneRulesSource } from "@purosur/domain";

export function fixedZoneRulesSource(offsetMinutes = -180): ZoneRulesSource {
  const rules = {
    version: null,
    transitions: [{ from: new Date(-8.64e15), offsetMinutes }],
  };
  return { zoneRules: () => rules };
}
