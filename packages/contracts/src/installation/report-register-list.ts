import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

export const reportRegisterListSchema = z.object({
  registers: z.array(z.object({ id: recordIdSchema(), name: z.string() })),
});

export type ReportRegisterListBody = z.output<typeof reportRegisterListSchema>;
