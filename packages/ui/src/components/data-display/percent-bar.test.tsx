import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { PercentBar } from "./percent-bar";

function renderBar(value: number) {
  return render(<PercentBar value={value} />);
}

test("shows the value as a whole percentage beside a bar filled to it", async () => {
  const screen = await renderBar(0.6429);

  const percent = screen.getByText("64 %").element();
  const track = screen.container.querySelector('[aria-hidden="true"]') as HTMLElement;
  const fill = track.firstElementChild as HTMLElement;
  const trackRect = track.getBoundingClientRect();

  expect(fill.getBoundingClientRect().width).toBeCloseTo(trackRect.width * 0.6429, 0);
  expect(percent.getBoundingClientRect().left - trackRect.right).toBeCloseTo(12, 0);
  await expectNoAccessibilityViolations(screen.container);
});

test("draws the percentage as subtle detail text", async () => {
  const screen = await renderBar(0.5);

  const style = getComputedStyle(screen.getByText("50 %").element());
  expect(style.fontSize).toBe("14px");
  expect(style.color).toBe(tokenRgb("text-subtle"));
});

test.each([
  [1.8, "100 %"],
  [-0.4, "0 %"],
  [Number.NaN, "0 %"],
])("shows the percentage the bar paints for a value of %s", async (value, shown) => {
  const screen = await renderBar(value);

  await expect.element(screen.getByText(shown)).toBeVisible();
});
