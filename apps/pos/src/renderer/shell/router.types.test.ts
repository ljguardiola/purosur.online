import type { ValidateNavigateOptions } from "@tanstack/react-router";
import { describe, expectTypeOf, it } from "vitest";
import type { router } from "./router";

type AppRouter = typeof router;

describe("the register's router types", () => {
  it("accepts navigating to a route that is actually declared", () => {
    type ToReadyScreen = { to: "/" };

    expectTypeOf<ToReadyScreen>().toExtend<ValidateNavigateOptions<AppRouter, ToReadyScreen>>();
  });

  it("fails to type-check navigating to a route that was never declared", () => {
    type ToUndeclaredScreen = { to: "/does-not-exist" };

    expectTypeOf<ToUndeclaredScreen>().not.toExtend<
      ValidateNavigateOptions<AppRouter, ToUndeclaredScreen>
    >();
  });
});
