import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { z } from "zod";
import {
  pointOfSaleNumberSchema,
  pointTerminalIdSchema,
  qrExternalPosIdSchema,
} from "../shared/index.js";

const instantSchema = z.string().meta({ timeZone: ARGENTINA_TIME_ZONE });

const installationSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("enrolled"),
    hostname: z.string(),
    windows_version: z.string(),
    enrolled_at: instantSchema,
    bitlocker_key_loaded: z.boolean(),
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
  point_terminal_id: pointTerminalIdSchema.nullable(),
  point_terminal_version: z.int().nonnegative(),
  qr_external_pos_id: qrExternalPosIdSchema.nullable(),
  qr_point_of_sale_version: z.int().nonnegative(),
  installation: installationSchema.nullable(),
});

export const registerListSchema = z.array(registerSummarySchema);

export type RegisterSummaryBody = z.output<typeof registerSummarySchema>;
