import type { RegisteredRouter } from "@tanstack/react-router";
import { describe, expectTypeOf, it } from "vitest";
import type { ActionEntry } from "./action-entries";

type Ability = ActionEntry["ability"];
type Destination = ActionEntry["to"];

describe("the no-session menu's action entries", () => {
  it.each([
    "view_sales_history",
    "reprint_receipt",
    "correct_register_clock",
    "record_initial_inventory",
  ] as const)("accepts %s as the ability of an entry", (key) => {
    expectTypeOf(key).toExtend<Ability>();
  });

  it("refuses the names that sell, collect, void, return or move cash", () => {
    expectTypeOf<"open_cash_session">().not.toExtend<Ability>();
    expectTypeOf<"sell_and_charge">().not.toExtend<Ability>();
    expectTypeOf<"void_sale">().not.toExtend<Ability>();
    expectTypeOf<"process_return">().not.toExtend<Ability>();
    expectTypeOf<"record_cash_in">().not.toExtend<Ability>();
    expectTypeOf<"record_cash_expense">().not.toExtend<Ability>();
    expectTypeOf<"withdraw_cash">().not.toExtend<Ability>();
  });

  it("opens a route the register declares", () => {
    expectTypeOf<"/sign-in">().toExtend<Destination>();
  });

  it("refuses to open a route that was never declared", () => {
    expectTypeOf<"/does-not-exist">().not.toExtend<Destination>();
  });

  it("takes its routes from the registered router", () => {
    expectTypeOf<Destination>().toEqualTypeOf<keyof RegisteredRouter["routesByPath"]>();
  });
});
