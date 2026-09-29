import { isPullCursor, PULL_PAGE_MAX_CHANGES } from "@purosur/domain";
import { z } from "zod";
import { branchSettingsSchema } from "../shared/index.js";

const SINCE_MESSAGE = "since must be the cursor of the last page already pulled, 0 the first time";

export const syncPullQuerySchema = z.object({
  since: z
    .string({ error: SINCE_MESSAGE })
    .regex(/^(?:0|[1-9][0-9]*)$/, SINCE_MESSAGE)
    .transform(Number)
    .refine(isPullCursor, SINCE_MESSAGE),
});

export type SyncPullQuery = z.input<typeof syncPullQuerySchema>;

const pullCursorSchema = z.int().refine(isPullCursor);

const branchSettingsChangeSchema = z.object({
  change_seq: z.int().positive(),
  entity: z.literal("branch_settings"),
  entity_id: z.string(),
  row: branchSettingsSchema,
});

export const syncPullPageSchema = z.object({
  changes: z
    .array(z.discriminatedUnion("entity", [branchSettingsChangeSchema]))
    .max(PULL_PAGE_MAX_CHANGES),
  cursor: pullCursorSchema,
  has_more: z.boolean(),
});

export type SyncPullPage = z.output<typeof syncPullPageSchema>;

export type SyncPulledChange = SyncPullPage["changes"][number];
