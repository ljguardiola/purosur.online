import { expect, test } from "vitest";
import * as UI from "./index";

// A wrapped component, such as react-aria's Focusable, is an object tagged with `$$typeof`
// rather than a function.
function isComponentOrFunction(value: unknown): boolean {
  return (
    typeof value === "function" ||
    (typeof value === "object" && value !== null && "$$typeof" in value)
  );
}

test("exports only components and functions, never a class string or another value", () => {
  const others = Object.entries(UI)
    .filter(([, value]) => !isComponentOrFunction(value))
    .map(([name]) => name);

  expect(others).toEqual([]);
});
