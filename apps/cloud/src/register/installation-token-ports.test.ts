import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import { describe, expectTypeOf, it } from "vitest";
import type { DeviceTokensOptions } from "./installation-token-ports.js";

describe("the device tokens' clock", () => {
  it("is required", () => {
    expectTypeOf<Omit<DeviceTokensOptions<PgQueryResultHKT>, "now">>().not.toExtend<
      DeviceTokensOptions<PgQueryResultHKT>
    >();
  });
});
