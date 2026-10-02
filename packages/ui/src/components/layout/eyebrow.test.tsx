import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
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
