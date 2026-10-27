import { localClock, type ZoneRules } from "../../shared/index.js";

export function generationStampOf(generatedAt: Date, rules: ZoneRules): string {
  return localClock(generatedAt, rules).toISOString().replace(/\D/g, "").slice(0, 14);
}
