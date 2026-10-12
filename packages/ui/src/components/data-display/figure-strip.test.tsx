import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { FigureStrip, type FigureStripProps } from "./figure-strip";

const figures = [
  { label: "Total contado", value: "12,150 kg" },
  { label: "Saldo esperado", value: "12,400 kg" },
  { label: "Diferencia", value: "− 0,250 kg", tone: "error" },
] as const;

test("shows the figures side by side in the order given", async () => {
  const screen = await render(<FigureStrip figures={figures} />);
  const boxes = ["Total contado", "Saldo esperado", "Diferencia"].map((label) =>
    screen.getByText(label, { exact: true }).element().getBoundingClientRect(),
  );

  expect(boxes[0]?.left).toBeLessThan(boxes[1]?.left ?? 0);
  expect(boxes[1]?.left).toBeLessThan(boxes[2]?.left ?? 0);
  expect(boxes[0]?.top).toBe(boxes[1]?.top);
  expect(boxes[1]?.top).toBe(boxes[2]?.top);
  await expectNoAccessibilityViolations(screen.container);
});

test("holds the figures in one tinted, 8px rounded card padded 16px", async () => {
  const screen = await render(<FigureStrip figures={figures} />);
  const style = getComputedStyle(screen.container.firstElementChild as HTMLElement);

  expect(style.backgroundColor).toBe(tokenRgb("surface-subtle"));
  expect(style.borderTopLeftRadius).toBe("8px");
  expect(style.paddingTop).toBe("16px");
  expect(style.paddingLeft).toBe("16px");
  expect(style.paddingRight).toBe("16px");
  expect(style.paddingBottom).toBe("16px");
});

test("draws each label in regular subtle detail text above its value", async () => {
  const screen = await render(<FigureStrip figures={figures} />);
  const label = screen.getByText("Total contado", { exact: true }).element() as HTMLElement;
  const value = screen.getByText("12,150 kg", { exact: true }).element() as HTMLElement;
  const style = getComputedStyle(label);

  expect(style.fontSize).toBe("14px");
  expect(style.fontWeight).toBe("400");
  expect(style.color).toBe(tokenRgb("text-subtle"));
  expect(style.textTransform).toBe("none");
  expect(label.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    value.getBoundingClientRect().top,
  );
});

test("draws each value in bold heading size", async () => {
  const screen = await render(<FigureStrip figures={figures} />);
  const style = getComputedStyle(screen.getByText("12,150 kg", { exact: true }).element());

  expect(style.fontSize).toBe("20px");
  expect(style.fontWeight).toBe("700");
});

test.each([
  ["neutral", "text"],
  ["success", "success"],
  ["error", "error"],
] as const)("draws a %s value in the %s text color", async (tone, token) => {
  const screen = await render(<FigureStrip figures={[{ label: "Diferencia", value: "1", tone }]} />);
  const style = getComputedStyle(screen.getByText("1", { exact: true }).element());

  expect(style.color).toBe(tokenRgb(token));
});

test("draws a value given no tone in the plain text color", async () => {
  const screen = await render(<FigureStrip figures={figures} />);
  const style = getComputedStyle(screen.getByText("12,150 kg", { exact: true }).element());

  expect(style.color).toBe(tokenRgb("text"));
});

test("does not accept a strip without figures", () => {
  expectTypeOf<{ figures: [] }>().not.toExtend<FigureStripProps>();
});
