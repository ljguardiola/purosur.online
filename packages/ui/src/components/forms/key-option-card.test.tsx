import { Calculator, Landmark } from "lucide-react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { KeyOptionCard, type KeyOptionCardProps } from "./key-option-card";

const card = (props: Partial<KeyOptionCardProps> = {}) => (
  <KeyOptionCard
    label="Transferencia"
    icon={<Landmark />}
    keyName="1"
    onPress={() => {}}
    {...props}
  />
);

test("is a button named by its label, with its key left out of the name", async () => {
  const screen = await render(card());

  await expect
    .element(screen.getByRole("button", { name: "Transferencia", exact: true }))
    .toBeVisible();
  expect(screen.container.querySelector("kbd")?.textContent).toBe("1");
  await expectNoAccessibilityViolations(screen.container);
});

test("calls onPress when pressed", async () => {
  const onPress = vi.fn();
  const screen = await render(card({ onPress }));

  await screen.getByRole("button", { name: "Transferencia" }).click();

  expect(onPress).toHaveBeenCalledTimes(1);
});

test("calls onPress from the keyboard", async () => {
  const onPress = vi.fn();
  await render(card({ onPress }));

  await userEvent.tab();
  await userEvent.keyboard("{Enter}");

  expect(onPress).toHaveBeenCalledTimes(1);
});

test("fills the width, with the icon on the left, the label after it and the key on the right", async () => {
  const screen = await render(<div style={{ width: 360 }}>{card()}</div>);

  const button = screen.getByRole("button").element().getBoundingClientRect();
  const icon = (screen.container.querySelector("svg") as SVGElement).getBoundingClientRect();
  const label = screen.getByText("Transferencia").element().getBoundingClientRect();
  const key = (screen.container.querySelector("kbd") as HTMLElement).getBoundingClientRect();
  expect(button.width).toBe(360);
  expect(icon.left - button.left).toBeLessThan(32);
  expect(label.left).toBeGreaterThan(icon.right);
  expect(key.left).toBeGreaterThan(label.left);
  expect(button.right - key.right).toBeLessThan(24);
});

test("draws the icon in the accent colour inside a round action badge", async () => {
  const screen = await render(card());

  const badge = (screen.container.querySelector("svg") as SVGElement).parentElement
    ?.parentElement as HTMLElement;
  const style = getComputedStyle(badge);
  expect(style.backgroundColor).toBe(tokenRgb("action-subtle"));
  expect(style.color).toBe(tokenRgb("text-accent"));
  expect(badge.getBoundingClientRect().width).toBe(badge.getBoundingClientRect().height);
  expect(Number.parseFloat(style.borderTopLeftRadius)).toBeGreaterThanOrEqual(
    badge.getBoundingClientRect().width / 2,
  );
});

test("draws a white card with a border", async () => {
  const screen = await render(card());

  const style = getComputedStyle(screen.getByRole("button").element());
  expect(style.backgroundColor).toBe(tokenRgb("surface"));
  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderTopColor).toBe(tokenRgb("border"));
});

test("turns subtle on hover", async () => {
  const screen = await render(card());
  const button = screen.getByRole("button").element();

  await userEvent.hover(button);

  await expect
    .poll(() => getComputedStyle(button).backgroundColor)
    .toBe(tokenRgb("surface-subtle"));
});

test("shows a focus ring when reached by keyboard", async () => {
  const screen = await render(card());

  await userEvent.tab();

  const style = getComputedStyle(screen.getByRole("button").element());
  expect(style.outlineStyle).not.toBe("none");
  expect(style.outlineWidth).not.toBe("0px");
});

test("when disabled, is dimmed, announced disabled and ignores presses", async () => {
  const onPress = vi.fn();
  const screen = await render(card({ disabled: true, onPress, icon: <Calculator /> }));

  const button = screen.getByRole("button", { name: "Transferencia" });
  await expect.element(button).toBeDisabled();
  expect(Number(getComputedStyle(button.element()).opacity)).toBeLessThan(1);
  await button.click({ force: true });
  expect(onPress).not.toHaveBeenCalled();
  await expectNoAccessibilityViolations(screen.container);
});

test("requires a label, an icon, a key and a press handler", () => {
  expectTypeOf<Omit<KeyOptionCardProps, "label">>().not.toExtend<KeyOptionCardProps>();
  expectTypeOf<Omit<KeyOptionCardProps, "keyName">>().not.toExtend<KeyOptionCardProps>();
  expectTypeOf<Omit<KeyOptionCardProps, "icon">>().not.toExtend<KeyOptionCardProps>();
  expectTypeOf<Omit<KeyOptionCardProps, "onPress">>().not.toExtend<KeyOptionCardProps>();
});
