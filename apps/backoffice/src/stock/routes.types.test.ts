import { expectTypeOf, test } from "vitest";
import type { z } from "zod";
import type { stockCountsFilters, stockMovementsFilters } from "./routes";

type OfferedPeriodOrNone = "7" | "30" | "90" | undefined;

test("a link to the counts names only a period the list offers", () => {
  expectTypeOf<z.input<typeof stockCountsFilters>["period"]>().toEqualTypeOf<OfferedPeriodOrNone>();
});

test("a link to the losses and adjustments names only a period the list offers", () => {
  expectTypeOf<
    z.input<typeof stockMovementsFilters>["period"]
  >().toEqualTypeOf<OfferedPeriodOrNone>();
});
