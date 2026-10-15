import { type ClockCorrectionAlertState, FACTURA_C_DOCUMENT_TYPE } from "@purosur/domain";
import { z } from "zod";
import { pointOfSaleNumberSchema } from "../shared/index.js";

const alertStateSchema: z.ZodType<ClockCorrectionAlertState> = z.enum(["open", "closed"]);

export const clockCorrectionSchema = z.object({
  id: z.string(),
  corrected_at: z.iso.datetime(),
  register_id: z.string(),
  register_name: z.string(),
  point_of_sale_number: pointOfSaleNumberSchema,
  document_type: z.literal(FACTURA_C_DOCUMENT_TYPE),
  actor_id: z.string(),
  actor_first_name: z.string(),
  previous_reading: z.iso.datetime(),
  corrected_reading: z.iso.datetime(),
  alert_state: alertStateSchema,
});

export const clockCorrectionListSchema = z.array(clockCorrectionSchema);

export type ClockCorrectionBody = z.output<typeof clockCorrectionSchema>;
