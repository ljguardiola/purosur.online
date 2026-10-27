import { areZoneTransitionsOrdered } from "@purosur/domain";
import { z } from "zod";

export const zoneRulesTransitionsSchema = z
  .array(z.object({ from: z.iso.datetime(), offset_minutes: z.int() }))
  .min(1)
  .refine((transitions) =>
    areZoneTransitionsOrdered(
      transitions.map(({ from }) => ({ from: new Date(from), offsetMinutes: 0 })),
    ),
  );
