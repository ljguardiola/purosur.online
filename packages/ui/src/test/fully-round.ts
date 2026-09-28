import { expect } from "vitest";

// rounded-full computes to an arbitrarily large radius, not 50%, so a fully round shape is one
// whose radius reaches at least half its shorter side, not one exact value.
export function expectFullyRound(element: HTMLElement): void {
  const { width, height } = element.getBoundingClientRect();

  expect(Number.parseFloat(getComputedStyle(element).borderRadius)).toBeGreaterThanOrEqual(
    Math.min(width, height) / 2,
  );
}
