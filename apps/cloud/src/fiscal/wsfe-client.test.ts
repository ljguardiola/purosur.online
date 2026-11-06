import { expectTypeOf, it } from "vitest";
import { codesOf, rejectionsOf } from "./wsfe-client.js";

it("reads a list of the tax authority's answer only by its Err or Obs element", () => {
  expectTypeOf(rejectionsOf).parameter(1).toEqualTypeOf<"Err" | "Obs">();
  expectTypeOf(codesOf).parameter(1).toEqualTypeOf<"Err" | "Obs">();
});
