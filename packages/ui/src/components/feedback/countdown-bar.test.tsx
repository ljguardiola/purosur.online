import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { CountdownBar, type CountdownBarProps } from "./countdown-bar";

type Screen = Awaited<ReturnType<typeof render>>;

function fillShare(screen: Screen): number {
  const timer = screen.getByRole("timer").element() as HTMLElement;
  const fill = timer.querySelector("[data-fill]") as HTMLElement;
  const track = fill.parentElement as HTMLElement;
  return fill.getBoundingClientRect().width / track.getBoundingClientRect().width;
}

test("is a timer named by the label the app provides", async () => {
  const screen = await render(
    <CountdownBar remainingSeconds={3} totalSeconds={3} label="Tiempo para imprimir" />,
  );

  await expect.element(screen.getByRole("timer", { name: "Tiempo para imprimir" })).toBeVisible();
});

test("shows the seconds that remain", async () => {
  const screen = await render(
    <CountdownBar remainingSeconds={2} totalSeconds={3} label="Tiempo para imprimir" />,
  );

  await expect.element(screen.getByText("2 s")).toBeVisible();
});

test("fills the bar in proportion to the time left", async () => {
  const screen = await render(
    <CountdownBar remainingSeconds={1} totalSeconds={4} label="Tiempo para imprimir" />,
  );

  expect(fillShare(screen)).toBeCloseTo(0.25, 2);
});

test("fills the whole bar when no time has elapsed", async () => {
  const screen = await render(
    <CountdownBar remainingSeconds={5} totalSeconds={5} label="Tiempo para imprimir" />,
  );

  expect(fillShare(screen)).toBeCloseTo(1, 2);
  await expect.element(screen.getByText("5 s")).toBeVisible();
});

test("draws an empty bar and 0 s once time is over", async () => {
  const screen = await render(
    <CountdownBar remainingSeconds={0} totalSeconds={3} label="Tiempo para imprimir" />,
  );

  expect(fillShare(screen)).toBe(0);
  await expect.element(screen.getByText("0 s")).toBeVisible();
});

test("never shows more time than the total", async () => {
  const screen = await render(
    <CountdownBar remainingSeconds={9} totalSeconds={3} label="Tiempo para imprimir" />,
  );

  expect(fillShare(screen)).toBeCloseTo(1, 2);
  await expect.element(screen.getByText("3 s")).toBeVisible();
});

test("never shows negative time", async () => {
  const screen = await render(
    <CountdownBar remainingSeconds={-2} totalSeconds={3} label="Tiempo para imprimir" />,
  );

  expect(fillShare(screen)).toBe(0);
  await expect.element(screen.getByText("0 s")).toBeVisible();
});

test("draws an empty bar when the total is zero", async () => {
  const screen = await render(
    <CountdownBar remainingSeconds={0} totalSeconds={0} label="Tiempo para imprimir" />,
  );

  expect(fillShare(screen)).toBe(0);
});

test("is rounded and paints the fill in the info color over the border-colored track", async () => {
  const screen = await render(
    <CountdownBar remainingSeconds={2} totalSeconds={3} label="Tiempo para imprimir" />,
  );
  const fill = screen.getByRole("timer").element().querySelector("[data-fill]") as HTMLElement;
  const track = fill.parentElement as HTMLElement;

  expect(getComputedStyle(fill).backgroundColor).toBe(tokenRgb("info"));
  expect(getComputedStyle(track).backgroundColor).toBe(tokenRgb("border"));
  expect(getComputedStyle(track).borderRadius).not.toBe("0px");
});

test("does not announce every second", async () => {
  const screen = await render(
    <CountdownBar remainingSeconds={2} totalSeconds={3} label="Tiempo para imprimir" />,
  );
  const timer = screen.getByRole("timer").element();

  expect(timer.querySelector("[aria-live]:not([aria-live='off'])")).toBeNull();
  expect(timer.getAttribute("aria-live")).not.toBe("polite");
  expect(timer.getAttribute("aria-live")).not.toBe("assertive");
});

test("has no accessibility violations", async () => {
  const screen = await render(
    <CountdownBar remainingSeconds={2} totalSeconds={3} label="Tiempo para imprimir" />,
  );

  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a countdown bar without a label", () => {
  expectTypeOf<{
    remainingSeconds: number;
    totalSeconds: number;
  }>().not.toExtend<CountdownBarProps>();
});
