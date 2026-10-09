import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { z } from "zod";
import { pointOfSaleNumberSchema } from "../shared/index.js";

const instantSchema = z.string().meta({ timeZone: ARGENTINA_TIME_ZONE });

const installationSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("enrolled"),
    hostname: z.string(),
    windows_version: z.string(),
    enrolled_at: instantSchema,
  }),
  z.object({
    state: z.literal("revoked"),
    hostname: z.string(),
    windows_version: z.string(),
    enrolled_at: instantSchema,
    revoked_at: instantSchema,
  }),
]);

export const registerSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  pending_code: z
    .object({
      seconds_since_issued: z.number().int().nonnegative(),
      seconds_until_expiry: z.number().int().positive(),
    })
    .nullable(),
  point_of_sale_number: pointOfSaleNumberSchema.nullable(),
  installation: installationSchema.nullable(),
});

export const registerListSchema = z.array(registerSummarySchema);

export type RegisterSummaryBody = z.output<typeof registerSummarySchema>;
