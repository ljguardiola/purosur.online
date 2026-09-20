import axe from "axe-core";
import { expect } from "vitest";

// `options` defaults to every rule axe ships, unchanged from before this parameter existed; a
// caller only ever passes one to turn off a specific rule it has a documented reason to, never to
// broaden what counts as a violation.
export async function expectNoAccessibilityViolations(
  target: Element,
  options?: axe.RunOptions,
): Promise<void> {
  const results = await axe.run(target, options ?? {});
  expect(results.violations).toEqual([]);
}
