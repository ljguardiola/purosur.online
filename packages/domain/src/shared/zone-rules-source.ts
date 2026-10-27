import type { ZoneRules } from "./zone-rules.js";

export interface ZoneRulesSource {
  zoneRules(): ZoneRules;
}
