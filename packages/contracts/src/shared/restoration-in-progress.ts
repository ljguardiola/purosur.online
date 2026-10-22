import { z } from "zod";

export const restorationInProgressOutcomeSchema = z.object({
  kind: z.literal("restoration_in_progress"),
});
