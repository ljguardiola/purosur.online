import { z } from "zod";

const levelOverviewSchema = z.object({
  openCount: z.int().nonnegative(),
  kinds: z.array(z.string()),
});

export const alertsOverviewSchema = z.object({
  critical: levelOverviewSchema,
  warning: levelOverviewSchema,
  informational: levelOverviewSchema,
});

export type AlertsOverview = z.output<typeof alertsOverviewSchema>;
