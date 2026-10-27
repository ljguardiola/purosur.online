import type { ZoneRules } from "@purosur/domain";

export const ARGENTINA_ZONE_RULES: ZoneRules = {
  version: "2026a",
  transitions: [{ from: new Date(0), offsetMinutes: -180 }],
};
