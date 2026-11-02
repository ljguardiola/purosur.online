import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { TextPreview } from "./text-preview";

const TEXT = "Pedido a Distribuidora Andina\nFecha: 05/10/2026\n\n1. Miel pura de abeja 1 kg";

function previewOf(screen: Awaited<ReturnType<typeof render>>): HTMLElement {
  return screen.container.firstElementChild as HTMLElement;
}

test("shows the text as given, keeping its line breaks", async () => {
  const screen = await render(<TextPreview text={TEXT} />);
  const preview = previewOf(screen);

  expect(preview.textContent).toBe(TEXT);
  expect(getComputedStyle(preview).whiteSpace).toBe("pre-wrap");
  expect(preview.getBoundingClientRect().height).toBeGreaterThan(
    3 * Number.parseFloat(getComputedStyle(preview).lineHeight),
  );
});

test("wraps a line longer than its box instead of overflowing it", async () => {
  const screen = await render(
    <div style={{ width: "200px" }}>
      <TextPreview text={`Yerba ${"mate ".repeat(40)}${"X".repeat(80)}`} />
    </div>,
  );
  const preview = previewOf(screen).firstElementChild as HTMLElement;

  expect(preview.scrollWidth).toBeLessThanOrEqual(preview.clientWidth);
});

test("draws the text in a monospace font on the subtle surface, 16px in and 8px rounded", async () => {
  const screen = await render(<TextPreview text={TEXT} />);
  const style = getComputedStyle(previewOf(screen));

  expect(style.fontFamily).toMatch(/monospace$/);
  expect(style.backgroundColor).toBe(tokenRgb("surface-subtle"));
  expect(style.color).toBe(tokenRgb("text"));
  expect(style.padding).toBe("16px");
  expect(style.borderRadius).toBe("8px");
});

test("has no accessibility violations", async () => {
  const screen = await render(<TextPreview text={TEXT} />);

  await expectNoAccessibilityViolations(screen.container);
});
