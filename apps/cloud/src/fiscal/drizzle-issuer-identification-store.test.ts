import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { describe, expectTypeOf, it } from "vitest";
import type { DrizzleIssuerIdentificationStore } from "./drizzle-issuer-identification-store.js";

describe("DrizzleIssuerIdentificationStore's clock", () => {
  it("is required to build the store", () => {
    expectTypeOf<[PgDatabase<PgQueryResultHKT>]>().not.toExtend<
      ConstructorParameters<typeof DrizzleIssuerIdentificationStore>
    >();
  });
});
