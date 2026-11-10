import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { expectFullyRound } from "../../test/fully-round";
import { tokenRgb } from "../../test/token-colors";
import { StatusPill, type StatusPillProps } from "./status-pill";

test("shows its text and is not interactive", async () => {
  const screen = await render(
    <main>
      <StatusPill tone="error">Sin conexión con la nube</StatusPill>
    </main>,
  );

  const pill = screen.getByText("Sin conexión con la nube").element() as HTMLElement;
  expect(pill.tagName).toBe("SPAN");
  expect(pill.tabIndex).toBe(-1);
  expect(screen.getByRole("button").elements()).toEqual([]);
  await expectNoAccessibilityViolations(document.body);
});

test("draws a fully round 28px pill in 12px bold text", async () => {
  const screen = await render(<StatusPill tone="warning">Contingencia CAEA</StatusPill>);

  const pill = screen.getByText("Contingencia CAEA").element() as HTMLElement;
  const style = getComputedStyle(pill);
  expect(style.display).toBe("inline-flex");
  expect(pill.getBoundingClientRect().height).toBe(28);
  expect(style.paddingLeft).toBe("12px");
  expect(style.paddingRight).toBe("12px");
  expect(style.fontSize).toBe("12px");
  expect(style.fontWeight).toBe("700");
  expectFullyRound(pill);
});

test("paints each tone's subtle fill under its strong text", async () => {
  const fills = { neutral: "neutral-subtle", warning: "warning-subtle", error: "error-subtle" };
  const inks = { neutral: "text-subtle", warning: "warning-strong", error: "error-strong" };
  for (const tone of ["neutral", "warning", "error"] as const) {
    const screen = await render(<StatusPill tone={tone}>{`Tono ${tone}`}</StatusPill>);

    const style = getComputedStyle(screen.getByText(`Tono ${tone}`).element());
    expect(style.backgroundColor, tone).toBe(tokenRgb(fills[tone]));
    expect(style.color, tone).toBe(tokenRgb(inks[tone]));
  }
});

test("accepts the neutral, warning and error tones, and needs its text", () => {
  expectTypeOf<{ tone: "neutral"; children: string }>().toExtend<StatusPillProps>();
  expectTypeOf<{ tone: "warning"; children: string }>().toExtend<StatusPillProps>();
  expectTypeOf<{ tone: "error"; children: string }>().toExtend<StatusPillProps>();
  expectTypeOf<{ tone: "info"; children: string }>().not.toExtend<StatusPillProps>();
  expectTypeOf<{ tone: "warning" }>().not.toExtend<StatusPillProps>();
  expectTypeOf<StatusPillProps>().not.toHaveProperty("className");
});
