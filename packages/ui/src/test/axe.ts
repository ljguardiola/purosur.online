import axe from "axe-core";
import { expect } from "vitest";

// axe.run reads per-check options from the run options it is handed, keyed by check id, but
// axe-core's published RunOptions type stops at the rule level and never declares them, so this
// adds the shape axe.run already honors rather than leaving callers to cast.
type CheckOptions = { [checkId: string]: { enabled?: boolean; options?: unknown } };

export type AccessibilityRunOptions = axe.RunOptions & { checks?: CheckOptions };

// Without `options`, every rule axe ships runs. A caller passes them only to narrow a single rule
// or check it has a documented reason to narrow, never to broaden what counts as a violation.
export async function expectNoAccessibilityViolations(
  target: Element,
  options?: AccessibilityRunOptions,
): Promise<void> {
  const results = await axe.run(target, options ?? {});
  expect(results.violations).toEqual([]);
}
