import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { describe, expectTypeOf, it } from "vitest";
import type { DrizzlePinCodeStore } from "./drizzle-pin-code-store.js";

describe("DrizzlePinCodeStore's clock", () => {
  it("is required to build the store", () => {
    expectTypeOf<[PgDatabase<PgQueryResultHKT>, string]>().not.toExtend<
      ConstructorParameters<typeof DrizzlePinCodeStore>
    >();
  });
});
