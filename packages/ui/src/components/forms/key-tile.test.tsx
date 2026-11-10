import { CreditCard } from "lucide-react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { KeyTile, type KeyTileProps } from "./key-tile";

const tile = (props: Partial<KeyTileProps> = {}) => (
  <KeyTile label="Point débito" icon={<CreditCard />} keyName="F9" onPress={() => {}} {...props} />
);

test("is a button named by its label, with its key left out of the name", async () => {
  const screen = await render(tile());

  await expect.element(screen.getByRole("button", { name: "Point débito", exact: true })).toBeVisible();
  expect(screen.container.querySelector("kbd")?.textContent).toBe("F9");
  await expectNoAccessibilityViolations(screen.container);
});

test("calls onPress when pressed", async () => {
  const onPress = vi.fn();
  const screen = await render(tile({ onPress }));

  await screen.getByRole("button", { name: "Point débito" }).click();

  expect(onPress).toHaveBeenCalledTimes(1);
});

test("calls onPress from the keyboard", async () => {
  const onPress = vi.fn();
  await render(tile({ onPress }));

  await userEvent.tab();
  await userEvent.keyboard("{Enter}");

  expect(onPress).toHaveBeenCalledTimes(1);
});

test("puts the icon at the top left, the key at the top right and the label below", async () => {
  const screen = await render(<div style={{ width: 110 }}>{tile()}</div>);

  const button = screen.getByRole("button").element().getBoundingClientRect();
  const icon = (screen.container.querySelector("svg") as SVGElement).getBoundingClientRect();
  const key = (screen.container.querySelector("kbd") as HTMLElement).getBoundingClientRect();
  const label = screen.getByText("Point débito").element().getBoundingClientRect();
  expect(icon.left - button.left).toBeLessThan(16);
  expect(button.right - key.right).toBeLessThan(16);
  expect(Math.abs(icon.top - key.top)).toBeLessThan(12);
  expect(label.top).toBeGreaterThan(icon.bottom);
  expect(label.top).toBeGreaterThan(key.bottom);
  expect(label.left).toBeLessThan(icon.left + 4);
});

test("draws a white tile with a border", async () => {
  const screen = await render(tile());

  const style = getComputedStyle(screen.getByRole("button").element());
  expect(style.backgroundColor).toBe(tokenRgb("surface"));
  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderTopColor).toBe(tokenRgb("border"));
});

test("turns subtle on hover", async () => {
  const screen = await render(tile());
  const button = screen.getByRole("button").element();

  await userEvent.hover(button);

  await expect.poll(() => getComputedStyle(button).backgroundColor).toBe(tokenRgb("surface-subtle"));
});

test("shows a focus ring when reached by keyboard", async () => {
  const screen = await render(tile());

  await userEvent.tab();

  const style = getComputedStyle(screen.getByRole("button").element());
  expect(style.outlineStyle).not.toBe("none");
  expect(style.outlineWidth).not.toBe("0px");
});

test("when disabled, is dimmed, announced disabled and ignores presses", async () => {
  const onPress = vi.fn();
  const screen = await render(tile({ disabled: true, onPress }));

  const button = screen.getByRole("button", { name: "Point débito" });
  await expect.element(button).toBeDisabled();
  expect(Number(getComputedStyle(button.element()).opacity)).toBeLessThan(1);
  await button.click({ force: true });
  expect(onPress).not.toHaveBeenCalled();
  await expectNoAccessibilityViolations(screen.container);
});

test("requires a label, an icon, a key and a press handler", () => {
  expectTypeOf<Omit<KeyTileProps, "label">>().not.toExtend<KeyTileProps>();
  expectTypeOf<Omit<KeyTileProps, "keyName">>().not.toExtend<KeyTileProps>();
  expectTypeOf<Omit<KeyTileProps, "icon">>().not.toExtend<KeyTileProps>();
  expectTypeOf<Omit<KeyTileProps, "onPress">>().not.toExtend<KeyTileProps>();
});
