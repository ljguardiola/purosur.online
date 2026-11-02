import { isCalendarDay } from "@purosur/domain";
import { z } from "zod";
import { pointOfSaleNumberSchema, recordIdSchema } from "../shared/index.js";

export const revokedInstallationConfirmationBodySchema = z.object({
  point_of_sale_number: pointOfSaleNumberSchema,
  fortnight_start: z.string().refine(isCalendarDay),
  installation_id: recordIdSchema(),
});

export type RevokedInstallationConfirmationBody = z.input<
  typeof revokedInstallationConfirmationBodySchema
>;
