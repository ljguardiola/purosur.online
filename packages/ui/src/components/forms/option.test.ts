import { createElement } from "react";
import { expect, expectTypeOf, test } from "vitest";
import type { Icon } from "../shared/icon";
import {
  isOptionValue,
  type NarrowedOption,
  type Option,
  type OptionalOptionChoiceProps,
  type OptionChoiceProps,
  type Options,
} from "./option";

type Kind = "income" | "expense";

const options = [
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
] satisfies Options<Option<Kind>>;

test("recognizes the value of one of the options", () => {
  expect(isOptionValue("income", options)).toBe(true);
  expect(isOptionValue("expense", options)).toBe(true);
});

test("rejects a key that is not the value of any option", () => {
  expect(isOptionValue("other", options)).toBe(false);
  expect(isOptionValue(1, options)).toBe(false);
  expect(isOptionValue(null, options)).toBe(false);
});

test("narrows a key to the option value type", () => {
  const key: string | number | null = "income";
  if (isOptionValue(key, options)) {
    expectTypeOf(key).toEqualTypeOf<Kind>();
  }
});

test("an option carries a value and a label, and optionally a description and an icon", () => {
  expectTypeOf<{ value: Kind; label: string }>().toExtend<Option<Kind>>();
  expectTypeOf<{
    value: Kind;
    label: string;
    description: string;
    icon: Icon;
  }>().toExtend<Option<Kind>>();
  expectTypeOf<{ value: Kind }>().not.toExtend<Option<Kind>>();
  expectTypeOf<{ label: string }>().not.toExtend<Option<Kind>>();
});

test("a narrowed option makes its required fields mandatory and its allowed ones optional", () => {
  type Card = NarrowedOption<Kind, "description" | "icon">;
  expectTypeOf<Option<Kind>>().not.toExtend<Card>();
  expectTypeOf<{ value: Kind; label: string; icon: Icon }>().not.toExtend<Card>();
  expectTypeOf<{ value: Kind; label: string; description: string }>().not.toExtend<Card>();
  expectTypeOf<{
    value: Kind;
    label: string;
    description: string;
    icon: Icon;
  }>().toExtend<Card>();

  type Segment = NarrowedOption<Kind, never, "icon">;
  expectTypeOf<{ value: Kind; label: string }>().toExtend<Segment>();
  expectTypeOf<{ value: Kind; label: string; icon: Icon }>().toExtend<Segment>();
  expectTypeOf<{ value: Kind; label: string; icon: string }>().not.toExtend<Segment>();
});

test("a narrowed option is still an option", () => {
  expectTypeOf<NarrowedOption<Kind>>().toExtend<Option<Kind>>();
  expectTypeOf<NarrowedOption<Kind, "description" | "icon">>().toExtend<Option<Kind>>();
});

test("a choice reports the chosen value, and only an optional choice may hold null", () => {
  type Choice = OptionChoiceProps<Kind, NarrowedOption<Kind>>;
  expectTypeOf<Choice["onChange"]>().parameters.toEqualTypeOf<[Kind]>();
  expectTypeOf<Choice["value"]>().toEqualTypeOf<Kind>();
  expectTypeOf<Choice["options"]>().toEqualTypeOf<Options<NarrowedOption<Kind>>>();

  type OptionalChoice = OptionalOptionChoiceProps<Kind, NarrowedOption<Kind>>;
  expectTypeOf<OptionalChoice["onChange"]>().parameters.toEqualTypeOf<[Kind]>();
  expectTypeOf<OptionalChoice["value"]>().toEqualTypeOf<Kind | null>();
});

test("an options list is never empty", () => {
  expectTypeOf<[]>().not.toExtend<Options<Option<Kind>>>();
  expectTypeOf<[Option<Kind>]>().toExtend<Options<Option<Kind>>>();
});

// A call that fails to compile can't sit in this file as literal code, and `@ts-expect-error` is
// banned, so the first (generic) overload only matches a call the contract accepts; a rejected
// call falls through to the fallback overload instead, resolving to `false`.
function acceptsPlainChoice<V extends string>(props: OptionChoiceProps<V, NarrowedOption<V>>): true;
function acceptsPlainChoice(props: unknown): false;
function acceptsPlainChoice(_props: unknown): boolean {
  return true;
}

test("a choice that renders only a value and a label rejects an option carrying an icon", () => {
  const accepted = acceptsPlainChoice({
    options: [{ value: "income", label: "Income" }],
    value: "income",
    onChange: () => {},
  });
  expectTypeOf(accepted).toEqualTypeOf<true>();

  const rejected = acceptsPlainChoice({
    options: [{ value: "income", label: "Income", icon: createElement("span") }],
    value: "income",
    onChange: () => {},
  });
  expectTypeOf(rejected).toEqualTypeOf<false>();
});

test("a choice cannot hold a value outside its options", () => {
  const rejected = acceptsPlainChoice({
    options: [{ value: "income", label: "Income" }],
    value: "other",
    onChange: () => {},
  });
  expectTypeOf(rejected).toEqualTypeOf<false>();
});
