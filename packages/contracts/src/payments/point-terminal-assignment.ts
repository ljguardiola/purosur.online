import { z } from "zod";
import { pointTerminalIdSchema } from "../shared/index.js";

const VERSION_MESSAGE = "version must be the non-negative integer it was loaded with";

export const pointTerminalAssignmentBodySchema = z.object({
  terminal_id: pointTerminalIdSchema.nullable(),
  version: z.number({ error: VERSION_MESSAGE }).int(VERSION_MESSAGE).min(0, VERSION_MESSAGE),
});

export const pointTerminalAssignmentSchema = z.object({
  register_id: z.string(),
  terminal_id: pointTerminalIdSchema.nullable(),
  version: z.int(),
});

export type PointTerminalAssignmentBody = z.input<typeof pointTerminalAssignmentBodySchema>;
export type PointTerminalAssignmentAnswer = z.output<typeof pointTerminalAssignmentSchema>;
