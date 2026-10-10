import { expect, expectTypeOf, test } from "vitest";
import { cdp } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { ProgressSteps, type ProgressStepsProps } from "./progress-steps";

const steps: ProgressStepsProps["steps"] = [
  { id: "created", label: "Orden creada", state: "done" },
  {
    id: "waiting",
    label: "Esperando que el cliente pague",
    detail: "Escanea el QR del mostrador con su app",
    state: "current",
  },
  { id: "approved", label: "Pago aprobado", state: "upcoming" },
];

function item(container: HTMLElement, index: number): HTMLElement {
  return container.querySelectorAll("li")[index] as HTMLElement;
}

function marker(container: HTMLElement, index: number): HTMLElement {
  return item(container, index).querySelector("[data-marker]") as HTMLElement;
}

test("is an ordered list with one item per step in order", async () => {
  const screen = await render(<ProgressSteps steps={steps} />);

  await expect.element(screen.getByRole("list")).toBeVisible();
  expect(screen.container.querySelector("ol")).not.toBeNull();
  expect(screen.getByRole("listitem").elements()).toHaveLength(3);
  expect(item(screen.container, 0).textContent).toContain("Orden creada");
  expect(item(screen.container, 2).textContent).toContain("Pago aprobado");
});

test("marks only the current step as the current step", async () => {
  const screen = await render(<ProgressSteps steps={steps} />);

  expect(item(screen.container, 0).getAttribute("aria-current")).toBeNull();
  expect(item(screen.container, 1).getAttribute("aria-current")).toBe("step");
  expect(item(screen.container, 2).getAttribute("aria-current")).toBeNull();
});

test("tells assistive technology the state of each step", async () => {
  const screen = await render(<ProgressSteps steps={steps} />);

  expect(item(screen.container, 0).textContent).toContain("Completado");
  expect(item(screen.container, 1).textContent).toContain("En curso");
  expect(item(screen.container, 2).textContent).toContain("Pendiente");
  expect(getComputedStyle(screen.getByText("Completado").element()).position).toBe("absolute");
});

test("shows a detail under the label when the step has one", async () => {
  const screen = await render(<ProgressSteps steps={steps} />);
  const style = getComputedStyle(
    screen.getByText("Escanea el QR del mostrador con su app").element(),
  );

  expect(style.fontSize).toBe("14px");
  expect(style.color).toBe(tokenRgb("text-subtle"));
});

test("writes labels at 16px: bold when current, normal when done, subtle when upcoming", async () => {
  const screen = await render(<ProgressSteps steps={steps} />);
  const done = getComputedStyle(screen.getByText("Orden creada").element());
  const current = getComputedStyle(screen.getByText("Esperando que el cliente pague").element());
  const upcoming = getComputedStyle(screen.getByText("Pago aprobado").element());

  expect(done.fontSize).toBe("16px");
  expect(done.fontWeight).toBe("400");
  expect(done.color).toBe(tokenRgb("text"));
  expect(current.fontSize).toBe("16px");
  expect(current.fontWeight).toBe("700");
  expect(upcoming.fontWeight).toBe("400");
  expect(upcoming.color).toBe(tokenRgb("text-subtle"));
});

test("draws a 24px round marker for each step, 12px from the texts", async () => {
  const screen = await render(<ProgressSteps steps={steps} />);

  for (const index of [0, 1, 2]) {
    const el = marker(screen.container, index);
    const rect = el.getBoundingClientRect();
    expect(rect.width).toBe(24);
    expect(rect.height).toBe(24);
    expect(getComputedStyle(el).borderTopLeftRadius).not.toBe("0px");
    expect(getComputedStyle(item(screen.container, index)).columnGap).toBe("12px");
  }
});

test("fills a done marker green with a white check", async () => {
  const screen = await render(<ProgressSteps steps={steps} />);
  const el = marker(screen.container, 0);
  const icon = el.querySelector("svg") as SVGElement;

  expect(getComputedStyle(el).backgroundColor).toBe(tokenRgb("success"));
  expect(getComputedStyle(icon).color).toBe(tokenRgb("text-inverse"));
  expect(icon.getAttribute("aria-hidden")).toBe("true");
});

test("fills the current marker blue with a white loader", async () => {
  const screen = await render(<ProgressSteps steps={steps} />);
  const el = marker(screen.container, 1);
  const icon = el.querySelector("svg") as SVGElement;

  expect(getComputedStyle(el).backgroundColor).toBe(tokenRgb("info"));
  expect(getComputedStyle(icon).color).toBe(tokenRgb("text-inverse"));
  expect(getComputedStyle(icon).animationName).not.toBe("none");
});

test("stops the loader from moving when the system asks for reduced motion", async () => {
  const session = cdp();
  await session.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });

  try {
    const screen = await render(<ProgressSteps steps={steps} />);
    const icon = marker(screen.container, 1).querySelector("svg") as SVGElement;

    await expect.poll(() => getComputedStyle(icon).animationName).toBe("none");
  } finally {
    await session.send("Emulation.setEmulatedMedia", { features: [] });
  }
});

test("draws an upcoming marker as a white circle with a 2px border and no icon", async () => {
  const screen = await render(<ProgressSteps steps={steps} />);
  const el = marker(screen.container, 2);
  const style = getComputedStyle(el);

  expect(style.backgroundColor).toBe(tokenRgb("surface"));
  expect(style.borderTopWidth).toBe("2px");
  expect(style.borderTopColor).toBe(tokenRgb("border"));
  expect(el.querySelector("svg")).toBeNull();
});

test("joins steps with a 2px connector in the border color, except after the last", async () => {
  const screen = await render(<ProgressSteps steps={steps} />);

  for (const index of [0, 1]) {
    const connector = item(screen.container, index).querySelector(
      "[data-connector]",
    ) as HTMLElement;
    const rect = connector.getBoundingClientRect();
    expect(rect.width).toBe(2);
    expect(rect.height).toBeGreaterThan(0);
    expect(getComputedStyle(connector).backgroundColor).toBe(tokenRgb("border"));
  }
  expect(item(screen.container, 2).querySelector("[data-connector]")).toBeNull();
});

test("shows every step done", async () => {
  const screen = await render(
    <ProgressSteps steps={steps.map((step) => ({ ...step, state: "done" as const }))} />,
  );

  expect(screen.container.querySelector("[aria-current]")).toBeNull();
  expect(screen.container.querySelectorAll("svg")).toHaveLength(3);
});

test("has no accessibility violations", async () => {
  const screen = await render(<ProgressSteps steps={steps} />);

  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a step with an unknown state", () => {
  expectTypeOf<{
    steps: { id: string; label: string; state: "failed" }[];
  }>().not.toExtend<ProgressStepsProps>();
});
