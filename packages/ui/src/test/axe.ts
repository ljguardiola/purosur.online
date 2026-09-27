import axe from "axe-core";
import { expect } from "vitest";

// axe.run accepts per-check options keyed by check id, but axe-core's published RunOptions type
// stops at the rule level and never declares them.
type CheckOptions = { [checkId: string]: { enabled?: boolean; options?: unknown } };

export type AccessibilityRunOptions = axe.RunOptions & { checks?: CheckOptions };

// Only for narrowing a single rule/check with a documented reason, never for broadening what
// counts as a violation.
export async function expectNoAccessibilityViolations(
  target: Element,
  options?: AccessibilityRunOptions,
): Promise<void> {
  const results = await axe.run(target, options ?? {});
  expect(results.violations).toEqual([]);
}
