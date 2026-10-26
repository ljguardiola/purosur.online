import { FIXED_ARGENTINA_ZONE_RULES, type ZoneRules } from "@purosur/domain";
import type { LocalDatabase } from "./local-database";

interface StoredTransition {
  from: string;
  offset_minutes: number;
}

export class ZoneRulesHolder {
  private readonly database: LocalDatabase;
  private rules: ZoneRules;

  constructor(database: LocalDatabase) {
    this.database = database;
    this.rules = this.latestStored();
  }

  current(): ZoneRules {
    return this.rules;
  }

  refresh(): void {
    this.rules = this.latestStored();
  }

  private latestStored(): ZoneRules {
    const latest = this.database
      .prepare<[], { version: string; transitions: string }>(
        "SELECT version, transitions FROM zone_rules ORDER BY published_at DESC, version DESC LIMIT 1",
      )
      .get();
    if (latest === undefined) {
      return FIXED_ARGENTINA_ZONE_RULES;
    }
    const transitions = JSON.parse(latest.transitions) as StoredTransition[];
    return {
      version: latest.version,
      transitions: transitions.map(({ from, offset_minutes }) => ({
        from: new Date(from),
        offsetMinutes: offset_minutes,
      })),
    };
  }
}
