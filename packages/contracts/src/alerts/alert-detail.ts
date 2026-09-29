import { z } from "zod";
import { alertAudienceSchema, alertLevelSchema } from "./alert-summary.js";

const alertDeliverySchema = z.object({
  channel: z.string(),
  status: z.string(),
  error: z.string().nullable(),
  createdAt: z.string(),
  recipient: z.object({
    id: z.string(),
    firstName: z.string(),
    role: z.object({
      id: z.string(),
      name: z.string().nullable(),
      isAdministrator: z.boolean(),
    }),
  }),
});

export const alertDetailSchema = z.object({
  id: z.string(),
  kind: z.string(),
  scope: z.string().nullable(),
  scopeDisplay: z.string().nullable(),
  level: alertLevelSchema,
  audience: alertAudienceSchema,
  detail: z.record(z.string(), z.unknown()),
  openedAt: z.string(),
  escalatedAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  deliveries: z.array(alertDeliverySchema),
});

export type AlertDetail = z.output<typeof alertDetailSchema>;
