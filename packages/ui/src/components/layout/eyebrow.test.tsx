import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import type { Tone } from "../shared/tone";
import { Eyebrow, type EyebrowProps } from "./eyebrow";

test("shows its text at 12px bold, in capitals, spaced and in the eyebrow color", async () => {
  const screen = await render(<Eyebrow text="Caja 1 · Sin sesión abierta" />);
  const eyebrow = screen.getByText("Caja 1 · Sin sesión abierta", { exact: true }).element();
  const style = getComputedStyle(eyebrow);

  expect(style.fontSize).toBe("12px");
  expect(style.fontWeight).toBe("700");
  expect(style.textTransform).toBe("uppercase");
  expect(style.letterSpacing).toBe("1.2px");
  expect(style.color).toBe(tokenRgb("text-eyebrow"));

  await expectNoAccessibilityViolations(screen.container);
});

test("is a paragraph of plain text, not a heading", async () => {
  const screen = await render(<Eyebrow text="Total a cobrar" />);
  const eyebrow = screen.getByText("Total a cobrar", { exact: true }).element();

  expect(eyebrow.tagName).toBe("P");
  expect(screen.container.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
});

test("colors its text with the tone it is given", async () => {
  const toneColors: Array<[Tone, string]> = [
    ["neutral", "text-eyebrow"],
    ["info", "info"],
    ["success", "success"],
    ["warning", "warning"],
    ["error", "error"],
  ];
  const screen = await render(
    toneColors.map(([tone]) => <Eyebrow key={tone} text={`Tono ${tone}`} tone={tone} />),
  );

  for (const [tone, token] of toneColors) {
    const eyebrow = screen.getByText(`Tono ${tone}`, { exact: true }).element();
    expect(getComputedStyle(eyebrow).color).toBe(tokenRgb(token));
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("can be a level-two heading, drawn the same as the plain eyebrow", async () => {
  const screen = await render(
    <>
      <Eyebrow text="Antes de empezar" headingLevel={2} />
      <Eyebrow text="Caja 1" />
    </>,
  );
  const heading = screen.getByRole("heading", { level: 2, name: "Antes de empezar" }).element();
  const plain = screen.getByText("Caja 1", { exact: true }).element();
  const headingStyle = getComputedStyle(heading);
  const plainStyle = getComputedStyle(plain);

  for (const property of [
    "fontSize",
    "fontWeight",
    "lineHeight",
    "textTransform",
    "letterSpacing",
    "color",
    "marginTop",
    "marginBottom",
  ] as const) {
    expect(headingStyle[property]).toBe(plainStyle[property]);
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("wraps a long text inside its container instead of overflowing it", async () => {
  const longText = "Un texto largo que no entra en una sola línea dentro de este espacio angosto";
  const screen = await render(
    <div style={{ width: "160px" }}>
      <Eyebrow text={longText} />
    </div>,
  );
  const eyebrow = screen.getByText(longText, { exact: true }).element();
  const container = eyebrow.parentElement as HTMLElement;
  const lineHeight = Number.parseFloat(getComputedStyle(eyebrow).lineHeight);

  expect(eyebrow.getBoundingClientRect().height).toBeGreaterThan(lineHeight * 1.5);
  expect(eyebrow.getBoundingClientRect().right).toBeLessThanOrEqual(
    container.getBoundingClientRect().right,
  );
});

test("does not accept an eyebrow without its text", () => {
  expectTypeOf<Record<string, never>>().not.toExtend<EyebrowProps>();
});

test("accepts a tone a caller may or may not have at hand", () => {
  expectTypeOf<{ text: string; tone: Tone | undefined }>().toExtend<EyebrowProps>();
});

test("does not accept a heading level other than two", () => {
  expectTypeOf<{ text: string; headingLevel: 1 }>().not.toExtend<EyebrowProps>();
  expectTypeOf<{ text: string; headingLevel: 3 }>().not.toExtend<EyebrowProps>();
});
