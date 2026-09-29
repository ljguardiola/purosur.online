import { ALERT_AUDIENCES, ALERT_LEVELS } from "@purosur/domain";
import { z } from "zod";

export const alertLevelSchema = z.enum(ALERT_LEVELS);
export const alertAudienceSchema = z.enum(ALERT_AUDIENCES);

export const alertSummarySchema = z.object({
  id: z.string(),
  kind: z.string(),
  scope: z.string().nullable(),
  scopeDisplay: z.string().nullable(),
  level: alertLevelSchema,
  audience: alertAudienceSchema,
  openedAt: z.string(),
  escalatedAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
});

export const alertListPageSchema = z.object({
  alerts: z.array(alertSummarySchema),
  total: z.int(),
  pageSize: z.int().positive(),
  openCount: z.int(),
  openCriticalCount: z.int(),
});

export type AlertSummary = z.output<typeof alertSummarySchema>;
export type AlertListPage = z.output<typeof alertListPageSchema>;
