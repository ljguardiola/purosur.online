import {
  currentZoneRulesPublication,
  FIXED_ARGENTINA_ZONE_RULES,
  type ZoneRules,
} from "@purosur/domain";
import type { LocalDatabase } from "./local-database";

interface StoredTransition {
  from: string;
  offset_minutes: number;
}

interface StoredZoneRules {
  version: string;
  publicationNumber: number;
  transitions: string;
}

export class ZoneRulesHolder {
  private readonly database: LocalDatabase;
  private rules: ZoneRules;

  constructor(database: LocalDatabase) {
    this.database = database;
    this.rules = this.currentStored();
  }

  current(): ZoneRules {
    return this.rules;
  }

  refresh(): void {
    this.rules = this.currentStored();
  }

  private currentStored(): ZoneRules {
    const current = currentZoneRulesPublication(
      this.database
        .prepare<[], StoredZoneRules>(
          "SELECT version, publication_number AS publicationNumber, transitions FROM zone_rules",
        )
        .all(),
    );
    if (current === undefined) {
      return FIXED_ARGENTINA_ZONE_RULES;
    }
    const transitions = JSON.parse(current.transitions) as StoredTransition[];
    return {
      version: current.version,
      transitions: transitions.map(({ from, offset_minutes }) => ({
        from: new Date(from),
        offsetMinutes: offset_minutes,
      })),
    };
  }
}
