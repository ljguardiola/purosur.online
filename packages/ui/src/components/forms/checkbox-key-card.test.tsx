import { useState } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { CheckboxKeyCard, type CheckboxKeyCardProps } from "./checkbox-key-card";

function card(props: Partial<CheckboxKeyCardProps> = {}) {
  return (
    <CheckboxKeyCard
      name="ticketChecked"
      label="Ticket verified"
      keyName="T"
      checked={false}
      onCheckedChange={() => {}}
      {...props}
    />
  );
}

function ToggledCard({ onCheckedChange }: { onCheckedChange: (checked: boolean) => void }) {
  const [checked, setChecked] = useState(false);
  return card({
    checked,
    onCheckedChange: (next) => {
      setChecked(next);
      onCheckedChange(next);
    },
  });
}

function cardLabel(screen: Awaited<ReturnType<typeof render>>): HTMLElement {
  return (screen.getByRole("checkbox").element() as HTMLElement).closest("label") as HTMLElement;
}

test("is a checkbox named by its label alone, with its key shown at the right", async () => {
  const screen = await render(card());

  await expect.element(screen.getByRole("checkbox", { name: "Ticket verified" })).toBeVisible();
  const label = cardLabel(screen);
  const keycap = label.querySelector("kbd") as HTMLElement;
  expect(keycap.textContent).toBe("T");
  const text = screen.getByText("Ticket verified").element();
  expect(keycap.getBoundingClientRect().left).toBeGreaterThan(text.getBoundingClientRect().right);
  expect(label.getBoundingClientRect().right - keycap.getBoundingClientRect().right).toBeLessThan(
    20,
  );
});

test("draws a bordered, rounded white card around the whole row", async () => {
  const screen = await render(card());
  const style = getComputedStyle(cardLabel(screen));

  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderTopColor).toBe(tokenRgb("border"));
  expect(style.borderTopLeftRadius).toBe("8px");
  expect(style.backgroundColor).toBe(tokenRgb("surface"));
});

test("shows the label in bold", async () => {
  const screen = await render(card());

  const text = screen.getByText("Ticket verified").element();
  expect(getComputedStyle(text).fontWeight).toBe("700");
});

test("reflects an unchecked and a checked state", async () => {
  const unchecked = await render(card({ checked: false }));
  expect((unchecked.getByRole("checkbox").element() as HTMLInputElement).checked).toBe(false);
  await unchecked.unmount();

  const checked = await render(card({ checked: true }));
  expect((checked.getByRole("checkbox").element() as HTMLInputElement).checked).toBe(true);
  const box = cardLabel(checked).children[1] as HTMLElement;
  expect(getComputedStyle(box).backgroundColor).toBe(tokenRgb("action"));
  expect(box.querySelector("svg")).not.toBeNull();
});

test("toggles when the label or the key is pressed", async () => {
  const onCheckedChange = vi.fn();
  const screen = await render(<ToggledCard onCheckedChange={onCheckedChange} />);

  await userEvent.click(screen.getByText("Ticket verified"));
  expect(onCheckedChange).toHaveBeenLastCalledWith(true);

  await userEvent.click(screen.container.querySelector("kbd") as HTMLElement);
  expect(onCheckedChange).toHaveBeenLastCalledWith(false);
  expect(onCheckedChange).toHaveBeenCalledTimes(2);
});

test("toggles with the space key once focused", async () => {
  const onCheckedChange = vi.fn();
  await render(<ToggledCard onCheckedChange={onCheckedChange} />);

  await userEvent.tab();
  await userEvent.keyboard(" ");

  expect(onCheckedChange).toHaveBeenCalledWith(true);
});

test("ignores presses when disabled", async () => {
  const onCheckedChange = vi.fn();
  const screen = await render(card({ disabled: true, onCheckedChange }));

  await userEvent.click(screen.getByText("Ticket verified"), { force: true });

  expect(onCheckedChange).not.toHaveBeenCalled();
});

test("has no accessibility violations, checked or not", async () => {
  const unchecked = await render(card());
  await expectNoAccessibilityViolations(unchecked.container);
  await unchecked.unmount();

  const checked = await render(card({ checked: true }));
  await expectNoAccessibilityViolations(checked.container);
});

test("does not accept a card without a name, a label or a key", () => {
  expectTypeOf<Omit<CheckboxKeyCardProps, "label">>().not.toExtend<CheckboxKeyCardProps>();
  expectTypeOf<Omit<CheckboxKeyCardProps, "keyName">>().not.toExtend<CheckboxKeyCardProps>();
  expectTypeOf<Omit<CheckboxKeyCardProps, "name">>().not.toExtend<CheckboxKeyCardProps>();
});
