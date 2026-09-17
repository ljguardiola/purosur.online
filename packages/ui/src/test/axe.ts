import axe from "axe-core";
import { expect } from "vitest";

export async function expectNoAccessibilityViolations(target: Element): Promise<void> {
  const results = await axe.run(target);
  expect(results.violations).toEqual([]);
}
