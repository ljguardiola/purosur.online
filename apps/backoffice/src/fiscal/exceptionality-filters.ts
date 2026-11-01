import { z } from "zod";

function currentYear(): number {
  return new Date().getFullYear();
}

export function exceptionalityYears(): [number, number, number] {
  const current = currentYear();
  return [current, current - 1, current - 2];
}

export const exceptionalityFilters = z
  .object({
    fiscalAddress: z.string().default("").catch(""),
    year: z
      .preprocess(
        (year) => (typeof year === "string" && /^\d{4}$/.test(year) ? Number(year) : year),
        z.number(),
      )
      .default(currentYear)
      .catch(currentYear),
  })
  .transform((filters) =>
    exceptionalityYears().includes(filters.year) ? filters : { ...filters, year: currentYear() },
  );

export type ExceptionalityFilters = z.output<typeof exceptionalityFilters>;
