import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { DiscountWeekdays } from "./discount-weekdays";

function markers(container: Element): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>("[data-weekday]")];
}

function fills(container: Element): string[] {
  return markers(container).map((marker) => getComputedStyle(marker).backgroundColor);
}

test("shows the seven weekdays as letters, Monday first", async () => {
  const screen = await render(<DiscountWeekdays weekdays={[1]} />);

  expect(markers(screen.container).map((marker) => marker.textContent)).toEqual([
    "L",
    "M",
    "M",
    "J",
    "V",
    "S",
    "D",
  ]);
});

test("fills only the weekdays the promotion runs on", async () => {
  const screen = await render(<DiscountWeekdays weekdays={[3, 5]} />);
  const [monday, tuesday, wednesday, thursday, friday, saturday, sunday] = fills(screen.container);

  expect(wednesday).toBe(friday);
  expect(new Set([monday, tuesday, thursday, saturday, sunday]).size).toBe(1);
  expect(monday).not.toBe(wednesday);
});

test("fills every weekday when the promotion names none", async () => {
  const none = await render(<DiscountWeekdays weekdays={[]} />);
  const all = await render(<DiscountWeekdays weekdays={[1, 2, 3, 4, 5, 6, 7]} />);
  const one = await render(<DiscountWeekdays weekdays={[2]} />);

  expect(fills(none.container)).toEqual(fills(all.container));
  expect(new Set(fills(none.container)).size).toBe(1);
  expect(fills(one.container)[1]).toBe(fills(none.container)[0]);
});

test("names the weekdays in its accessible text", async () => {
  const screen = await render(<DiscountWeekdays weekdays={[1, 3, 5]} />);

  await expect
    .element(screen.getByRole("img", { name: "Lunes, miércoles y viernes" }))
    .toBeVisible();
});

test("says every day when no weekday is named", async () => {
  const screen = await render(<DiscountWeekdays weekdays={[]} />);

  await expect.element(screen.getByRole("img", { name: "Todos los días" })).toBeVisible();
});

test("has no accessibility violations", async () => {
  const screen = await render(<DiscountWeekdays weekdays={[2]} />);

  await expectNoAccessibilityViolations(screen.container);
});
