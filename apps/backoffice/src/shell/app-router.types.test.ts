import type { RegisteredRouter, ValidateNavigateOptions } from "@tanstack/react-router";
import { expectTypeOf, test } from "vitest";
import "./app-router";

type Navigable<Options> = ValidateNavigateOptions<RegisteredRouter, Options>;

test("accepts navigation to a declared screen", () => {
  expectTypeOf<{ to: "/users" }>().toExtend<Navigable<{ to: "/users" }>>();
  expectTypeOf<{ to: "/users/$userId"; params: { userId: string } }>().toExtend<
    Navigable<{ to: "/users/$userId"; params: { userId: string } }>
  >();
});

test("refuses navigation to a route that is not declared", () => {
  expectTypeOf<{ to: "/settings/people" }>().not.toExtend<Navigable<{ to: "/settings/people" }>>();
});

test("refuses navigation to the user detail screen without the user's id", () => {
  expectTypeOf<{ to: "/users/$userId" }>().not.toExtend<Navigable<{ to: "/users/$userId" }>>();
});

test("refuses navigation with a mistyped parameter", () => {
  expectTypeOf<{ to: "/users/$userId"; params: { id: string } }>().not.toExtend<
    Navigable<{ to: "/users/$userId"; params: { id: string } }>
  >();
});

test("accepts a list filter value the list offers", () => {
  expectTypeOf<{ to: "/products"; search: { status: "inactive" } }>().toExtend<
    Navigable<{ to: "/products"; search: { status: "inactive" } }>
  >();
});

test("refuses a list filter value the list does not offer", () => {
  expectTypeOf<{ to: "/products"; search: { status: "archived" } }>().not.toExtend<
    Navigable<{ to: "/products"; search: { status: "archived" } }>
  >();
});
