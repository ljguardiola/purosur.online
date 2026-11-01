import { z } from "zod";

export const orderSuggestionFilters = z.object({
  search: z.string().default("").catch(""),
});

export type OrderSuggestionFilters = z.output<typeof orderSuggestionFilters>;
