import { z } from "zod";

export const readableEventVersionsSchema = z.object({
  event_versions: z.array(z.string().regex(/^[a-z_]+@[1-9]\d*$/)),
});

export type ReadableEventVersions = z.output<typeof readableEventVersionsSchema>;
