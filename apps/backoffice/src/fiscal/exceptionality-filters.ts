import { z } from "zod";

export const exceptionalityFilters = z.object({
  fiscalAddress: z.string().default("").catch(""),
  year: z
    .preprocess(
      (year) => (typeof year === "string" && /^[1-9]\d{3}$/.test(year) ? Number(year) : year),
      z.int().min(1000).max(9999).optional(),
    )
    .catch(undefined),
});

export type ExceptionalityFilters = z.output<typeof exceptionalityFilters>;
