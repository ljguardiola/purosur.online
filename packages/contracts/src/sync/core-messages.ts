import { z } from "zod";

export const syncCoreToRendererMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pulled") }),
]);
export type SyncCoreToRendererMessage = z.infer<typeof syncCoreToRendererMessageSchema>;
