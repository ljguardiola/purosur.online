import { z } from "zod";
import { offsiteDumpNightSchema } from "./offsite-dump-night.js";

export const offsiteDumpManifestSchema = z.strictObject({
  night: offsiteDumpNightSchema,
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export type OffsiteDumpManifest = z.output<typeof offsiteDumpManifestSchema>;
