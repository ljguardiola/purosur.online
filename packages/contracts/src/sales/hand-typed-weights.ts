import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { z } from "zod";
import { answeredRangeSchema } from "../shared/index.js";

const count = z.int().nonnegative();

export const handTypedWeightsSchema = z.object({
  range: answeredRangeSchema,
  cashiers: z.array(
    z.object({
      cashier_id: z.string().min(1),
      name: z.string().nullable(),
      weighed_lines: count,
      typed_lines: count,
    }),
  ),
  sessions: z.array(
    z.object({
      session_id: z.string().min(1),
      register_name: z.string().min(1),
      opened_at: z.iso.datetime().meta({ timeZone: ARGENTINA_TIME_ZONE }),
      weighed_lines: count,
      typed_lines: count,
    }),
  ),
  totals: z.object({ weighed_lines: count, typed_lines: count }),
});

export type HandTypedWeightsBody = z.output<typeof handTypedWeightsSchema>;
