import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { expectFullyRound } from "../../test/fully-round";
import { tokenRgb } from "../../test/token-colors";
import { ScaleStatusBadge, type ScaleStatusBadgeProps } from "./scale-status-badge";

test("says Estable in a fully round badge when the reading is stable", async () => {
  const screen = await render(<ScaleStatusBadge status="stable" />);

  await expect.element(screen.getByText("Estable")).toBeVisible();
  expectFullyRound(screen.container.firstElementChild as HTMLElement);
  await expectNoAccessibilityViolations(screen.container);
});

test("fills a stable badge with the success color and marks it with a check", async () => {
  const screen = await render(<ScaleStatusBadge status="stable" />);
  const badge = screen.container.firstElementChild as HTMLElement;

  expect(getComputedStyle(badge).backgroundColor).toBe(tokenRgb("success-strong"));
  expect(getComputedStyle(badge).color).toBe(tokenRgb("text-inverse"));
  expect(badge.querySelector("svg")).not.toBeNull();
});

test("says Moviéndose in an outlined badge marked with an amber dot when the reading moves", async () => {
  const screen = await render(<ScaleStatusBadge status="moving" />);
  const badge = screen.container.firstElementChild as HTMLElement;

  await expect.element(screen.getByText("Moviéndose")).toBeVisible();
  const dot = badge.querySelector("[aria-hidden='true']") as HTMLElement;

  expect(getComputedStyle(badge).borderTopColor).toBe(tokenRgb("warning-soft"));
  expect(getComputedStyle(badge).color).toBe(tokenRgb("warning-strong"));
  expect(getComputedStyle(dot).backgroundColor).toBe(tokenRgb("warning-soft"));
  expect(badge.querySelector("svg")).toBeNull();
  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a status it does not draw", () => {
  expectTypeOf<{ status: "unknown" }>().not.toExtend<ScaleStatusBadgeProps>();
});
