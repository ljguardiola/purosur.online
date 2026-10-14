import { isOffsiteDumpNight } from "@purosur/domain";
import { z } from "zod";

export const offsiteDumpManifestSchema = z.strictObject({
  night: z.string().refine(isOffsiteDumpNight, {
    message: "night must be a calendar day written YYYY-MM-DD",
  }),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export type OffsiteDumpManifest = z.output<typeof offsiteDumpManifestSchema>;
