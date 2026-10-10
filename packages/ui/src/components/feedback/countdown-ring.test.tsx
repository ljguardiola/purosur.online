import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { CountdownRing, type CountdownRingProps } from "./countdown-ring";

function arcShare(container: HTMLElement): number {
  const arc = container.querySelectorAll("circle")[1] as SVGCircleElement;
  const [visible] = (arc.getAttribute("stroke-dasharray") ?? "").split(" ");
  return Number(visible) / Number(arc.getAttribute("pathLength"));
}

test("is a timer named by the label the app provides", async () => {
  const screen = await render(
    <CountdownRing remainingSeconds={161} totalSeconds={180} label="Tiempo para pagar" />,
  );

  await expect.element(screen.getByRole("timer", { name: "Tiempo para pagar" })).toBeVisible();
});

test("shows the remaining time and the total in the center", async () => {
  const screen = await render(
    <CountdownRing remainingSeconds={161} totalSeconds={180} label="Tiempo para pagar" />,
  );

  await expect.element(screen.getByText("2:41")).toBeVisible();
  await expect.element(screen.getByText("de 3:00")).toBeVisible();
});

test("is a 148px square", async () => {
  const screen = await render(
    <CountdownRing remainingSeconds={90} totalSeconds={180} label="Tiempo para pagar" />,
  );
  const rect = (screen.getByRole("timer").element() as HTMLElement).getBoundingClientRect();

  expect(rect.width).toBe(148);
  expect(rect.height).toBe(148);
});

test("draws the track in the border color and the arc in the info color", async () => {
  const screen = await render(
    <CountdownRing remainingSeconds={90} totalSeconds={180} label="Tiempo para pagar" />,
  );
  const [track, arc] = Array.from(screen.container.querySelectorAll("circle"));

  expect(getComputedStyle(track as Element).stroke).toBe(tokenRgb("border"));
  expect(getComputedStyle(arc as Element).stroke).toBe(tokenRgb("info"));
  expect(arc?.getAttribute("stroke-width")).toBe("10");
});

test("shows the remaining time large, bold and in the info color", async () => {
  const screen = await render(
    <CountdownRing remainingSeconds={161} totalSeconds={180} label="Tiempo para pagar" />,
  );
  const style = getComputedStyle(screen.getByText("2:41").element());

  expect(style.fontSize).toBe("32px");
  expect(style.fontWeight).toBe("700");
  expect(style.color).toBe(tokenRgb("info"));
});

test("shows the total in 14px secondary text", async () => {
  const screen = await render(
    <CountdownRing remainingSeconds={161} totalSeconds={180} label="Tiempo para pagar" />,
  );
  const style = getComputedStyle(screen.getByText("de 3:00").element());

  expect(style.fontSize).toBe("14px");
  expect(style.color).toBe(tokenRgb("text-subtle"));
});

test("draws an arc proportional to the time left", async () => {
  const screen = await render(
    <CountdownRing remainingSeconds={45} totalSeconds={180} label="Tiempo para pagar" />,
  );

  expect(arcShare(screen.container)).toBeCloseTo(0.25, 5);
});

test("starts the arc at 12 o'clock", async () => {
  const screen = await render(
    <CountdownRing remainingSeconds={90} totalSeconds={180} label="Tiempo para pagar" />,
  );
  const svg = screen.container.querySelector("svg") as SVGSVGElement;
  const arc = screen.container.querySelectorAll("circle")[1] as SVGCircleElement;

  expect(svg.getAttribute("aria-hidden")).toBe("true");
  expect(getComputedStyle(arc).strokeDashoffset).toBe("0px");
  expect(getComputedStyle(svg).rotate).toBe("-90deg");
});

test("draws the whole ring when no time has elapsed", async () => {
  const screen = await render(
    <CountdownRing remainingSeconds={180} totalSeconds={180} label="Tiempo para pagar" />,
  );

  expect(arcShare(screen.container)).toBe(1);
});

test("draws no arc once time is over", async () => {
  const screen = await render(
    <CountdownRing remainingSeconds={0} totalSeconds={180} label="Tiempo para pagar" />,
  );

  expect(arcShare(screen.container)).toBe(0);
  await expect.element(screen.getByText("0:00")).toBeVisible();
});

test("never shows more time than the total", async () => {
  const screen = await render(
    <CountdownRing remainingSeconds={500} totalSeconds={180} label="Tiempo para pagar" />,
  );

  expect(arcShare(screen.container)).toBe(1);
  await expect.element(screen.getByText("3:00", { exact: true })).toBeVisible();
});

test("never shows negative time", async () => {
  const screen = await render(
    <CountdownRing remainingSeconds={-5} totalSeconds={180} label="Tiempo para pagar" />,
  );

  expect(arcShare(screen.container)).toBe(0);
  await expect.element(screen.getByText("0:00")).toBeVisible();
});

test("does not announce every second", async () => {
  const screen = await render(
    <CountdownRing remainingSeconds={161} totalSeconds={180} label="Tiempo para pagar" />,
  );
  const timer = screen.getByRole("timer").element();

  expect(timer.querySelector("[aria-live]:not([aria-live='off'])")).toBeNull();
  expect(timer.getAttribute("aria-live")).not.toBe("polite");
  expect(timer.getAttribute("aria-live")).not.toBe("assertive");
});

test("has no accessibility violations", async () => {
  const screen = await render(
    <CountdownRing remainingSeconds={9} totalSeconds={180} label="Tiempo para pagar" />,
  );

  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a countdown ring without a label", () => {
  expectTypeOf<{
    remainingSeconds: number;
    totalSeconds: number;
  }>().not.toExtend<CountdownRingProps>();
});
