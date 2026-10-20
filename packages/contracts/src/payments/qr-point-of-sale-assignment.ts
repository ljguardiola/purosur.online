import { z } from "zod";
import { qrExternalPosIdSchema } from "../shared/index.js";

const VERSION_MESSAGE = "version must be the non-negative integer it was loaded with";

export const qrPointOfSaleAssignmentBodySchema = z.object({
  external_pos_id: qrExternalPosIdSchema.nullable(),
  version: z.number({ error: VERSION_MESSAGE }).int(VERSION_MESSAGE).min(0, VERSION_MESSAGE),
});

export const qrPointOfSaleAssignmentSchema = z.object({
  register_id: z.string(),
  external_pos_id: qrExternalPosIdSchema.nullable(),
  version: z.int(),
});

export type QrPointOfSaleAssignmentBody = z.input<typeof qrPointOfSaleAssignmentBodySchema>;
export type QrPointOfSaleAssignmentAnswer = z.output<typeof qrPointOfSaleAssignmentSchema>;
