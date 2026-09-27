import type { RegisteredRouter, ValidateNavigateOptions } from "@tanstack/react-router";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expectTypeOf, it } from "vitest";
import "./router";

type AppRouter = RegisteredRouter;

const rootRoute = createRootRoute();
const saleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sales/$saleId",
});
const routerWithParams = createRouter({
  routeTree: rootRoute.addChildren([saleRoute]),
  history: createMemoryHistory({ initialEntries: ["/sales/1"] }),
});

type RouterWithParams = typeof routerWithParams;

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

  it("accepts navigating to a route with its parameter", () => {
    type ToSale = { to: "/sales/$saleId"; params: { saleId: string } };

    expectTypeOf<ToSale>().toExtend<ValidateNavigateOptions<RouterWithParams, ToSale>>();
  });

  it("fails to type-check navigating to a route without its parameter", () => {
    type ToSaleWithoutId = { to: "/sales/$saleId" };

    expectTypeOf<ToSaleWithoutId>().not.toExtend<
      ValidateNavigateOptions<RouterWithParams, ToSaleWithoutId>
    >();
  });

  it("fails to type-check navigating to a route with a mistyped parameter", () => {
    type ToSaleWithNumericId = { to: "/sales/$saleId"; params: { saleId: number } };

    expectTypeOf<ToSaleWithNumericId>().not.toExtend<
      ValidateNavigateOptions<RouterWithParams, ToSaleWithNumericId>
    >();
  });
});
