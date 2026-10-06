import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { describe, expectTypeOf, it } from "vitest";
import type { DrizzleFirstPinCodeStore } from "./drizzle-first-pin-code-store.js";

describe("DrizzleFirstPinCodeStore's clock", () => {
  it("is required to build the store", () => {
    expectTypeOf<[PgDatabase<PgQueryResultHKT>]>().not.toExtend<
      ConstructorParameters<typeof DrizzleFirstPinCodeStore>
    >();
  });
});
