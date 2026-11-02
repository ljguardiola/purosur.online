import { isCalendarDay } from "@purosur/domain";
import { z } from "zod";
import { pointOfSaleNumberSchema } from "../shared/index.js";

export const revokedInstallationConfirmationBodySchema = z.object({
  point_of_sale_number: pointOfSaleNumberSchema,
  fortnight_start: z.string().refine(isCalendarDay),
  installation_id: z.uuid(),
});

export type RevokedInstallationConfirmationBody = z.input<
  typeof revokedInstallationConfirmationBodySchema
>;
