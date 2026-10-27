import { FIXED_ARGENTINA_ZONE_RULES, type ZoneRulesSource } from "@purosur/domain";

export function fixedZoneRulesSource(): ZoneRulesSource {
  return { zoneRules: () => FIXED_ARGENTINA_ZONE_RULES };
}
