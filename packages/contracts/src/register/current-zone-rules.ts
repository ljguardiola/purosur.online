import { z } from "zod";
import { zoneRulesTransitionsSchema } from "../shared/index.js";

export const currentZoneRulesSchema = z.object({
  version: z.string().min(1),
  transitions: zoneRulesTransitionsSchema,
});

export type CurrentZoneRulesWire = z.output<typeof currentZoneRulesSchema>;
