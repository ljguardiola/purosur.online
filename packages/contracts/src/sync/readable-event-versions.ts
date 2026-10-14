import { z } from "zod";

export const readableEventVersionsSchema = z.object({
  event_versions: z.array(z.string()),
});

export type ReadableEventVersions = z.output<typeof readableEventVersionsSchema>;
