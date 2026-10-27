import { FIXED_ARGENTINA_ZONE_RULES, type ZoneRules } from "../zone-rules.js";
import type { ZoneRulesSource } from "../zone-rules-source.js";

export class FakeZoneRulesSource implements ZoneRulesSource {
  private readonly rules: ZoneRules;

  constructor(rules: ZoneRules = FIXED_ARGENTINA_ZONE_RULES) {
    this.rules = rules;
  }

  zoneRules(): ZoneRules {
    return this.rules;
  }
}

export function fixedOffsetZoneRules(offsetMinutes: number): ZoneRules {
  return { version: null, transitions: [{ from: new Date(-8.64e15), offsetMinutes }] };
}
