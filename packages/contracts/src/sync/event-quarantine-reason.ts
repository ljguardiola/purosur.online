import { z } from "zod";

export const eventQuarantineReasonSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unreadable") }),
  z.object({
    kind: z.literal("missing_dependency"),
    aggregateType: z.string(),
    aggregateId: z.string(),
  }),
  z.object({ kind: z.literal("not_recorded") }),
]);

export type EventQuarantineReason = z.output<typeof eventQuarantineReasonSchema>;
