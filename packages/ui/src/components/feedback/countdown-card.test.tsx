import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { CountdownCard, type CountdownCardProps } from "./countdown-card";

function arcShare(container: HTMLElement): number {
  const arc = container.querySelectorAll("circle")[1] as SVGCircleElement;
  const [visible] = (arc.getAttribute("stroke-dasharray") ?? "").split(" ");
  return Number(visible) / Number(arc.getAttribute("pathLength"));
}

test("shows the label and the remaining time as minutes and seconds", async () => {
  const screen = await render(
    <CountdownCard remainingSeconds={102} totalSeconds={180} label="Tiempo para pagar" />,
  );

  await expect.element(screen.getByText("Tiempo para pagar")).toBeVisible();
  await expect.element(screen.getByText("1:42")).toBeVisible();
});

test("is a timer named by the label the app provides", async () => {
  const screen = await render(
    <CountdownCard remainingSeconds={102} totalSeconds={180} label="Tiempo para pagar" />,
  );

  await expect.element(screen.getByRole("timer", { name: "Tiempo para pagar" })).toBeVisible();
});

test("fills the width of its container", async () => {
  const screen = await render(
    <div style={{ width: 320 }}>
      <CountdownCard remainingSeconds={102} totalSeconds={180} label="Tiempo para pagar" />
    </div>,
  );
  const rect = (screen.getByRole("timer").element() as HTMLElement).getBoundingClientRect();

  expect(rect.width).toBe(320);
});

test("draws a small ring with the arc in the info color over a border-colored track", async () => {
  const screen = await render(
    <CountdownCard remainingSeconds={90} totalSeconds={180} label="Tiempo para pagar" />,
  );
  const [track, arc] = Array.from(screen.container.querySelectorAll("circle"));
  const svg = screen.container.querySelector("svg") as SVGSVGElement;

  expect(svg.getAttribute("aria-hidden")).toBe("true");
  expect(svg.getBoundingClientRect().width).toBe(40);
  expect(getComputedStyle(track as Element).stroke).toBe(tokenRgb("border"));
  expect(getComputedStyle(arc as Element).stroke).toBe(tokenRgb("info"));
});

test("draws an arc proportional to the time left", async () => {
  const screen = await render(
    <CountdownCard remainingSeconds={45} totalSeconds={180} label="Tiempo para pagar" />,
  );

  expect(arcShare(screen.container)).toBeCloseTo(0.25, 5);
});

test("tints the card with the info surface and shows the time in bold", async () => {
  const screen = await render(
    <CountdownCard remainingSeconds={102} totalSeconds={180} label="Tiempo para pagar" />,
  );
  const timer = screen.getByRole("timer").element();
  const time = getComputedStyle(screen.getByText("1:42").element());

  expect(getComputedStyle(timer).backgroundColor).toBe(tokenRgb("info-subtle"));
  expect(time.fontWeight).toBe("700");
  expect(time.color).toBe(tokenRgb("info-strong"));
});

test("shows the danger tone with the error colors", async () => {
  const screen = await render(
    <CountdownCard
      remainingSeconds={0}
      totalSeconds={180}
      label="Tiempo para pagar"
      tone="danger"
    />,
  );
  const timer = screen.getByRole("timer").element();
  const [, arc] = Array.from(screen.container.querySelectorAll("circle"));

  expect(getComputedStyle(timer).backgroundColor).toBe(tokenRgb("error-subtle"));
  expect(getComputedStyle(screen.getByText("0:00").element()).color).toBe(tokenRgb("error-strong"));
  expect(getComputedStyle(arc as Element).stroke).toBe(tokenRgb("error"));
});

test("never shows more time than the total", async () => {
  const screen = await render(
    <CountdownCard remainingSeconds={500} totalSeconds={180} label="Tiempo para pagar" />,
  );

  expect(arcShare(screen.container)).toBe(1);
  await expect.element(screen.getByText("3:00")).toBeVisible();
});

test("never shows negative time", async () => {
  const screen = await render(
    <CountdownCard remainingSeconds={-5} totalSeconds={180} label="Tiempo para pagar" />,
  );

  expect(arcShare(screen.container)).toBe(0);
  await expect.element(screen.getByText("0:00")).toBeVisible();
});

test("has no accessibility violations", async () => {
  const screen = await render(
    <CountdownCard
      remainingSeconds={9}
      totalSeconds={180}
      label="Tiempo para pagar"
      tone="danger"
    />,
  );

  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a countdown card without a label", () => {
  expectTypeOf<{
    remainingSeconds: number;
    totalSeconds: number;
  }>().not.toExtend<CountdownCardProps>();
});
