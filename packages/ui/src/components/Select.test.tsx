import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { tokenRgb } from "../test/token-colors";
import { Select, type SelectOption, type SelectProps } from "./Select";

type Role = "administrator" | "shift-lead" | "cashier";

const options: [SelectOption<Role>, SelectOption<Role>, SelectOption<Role>] = [
  { value: "administrator", label: "Administrador" },
  { value: "shift-lead", label: "Responsable de turno" },
  { value: "cashier", label: "Atención de caja" },
];

function baseProps(overrides: Partial<SelectProps<Role>> = {}): SelectProps<Role> {
  return {
    label: "Rol",
    options,
    value: "shift-lead",
    onChange: () => {},
    ...overrides,
  };
}

test("associates the label with the trigger, and names it with both the chosen option and the label", async () => {
  const screen = await render(<Select {...baseProps()} />);

  await expect
    .element(screen.getByRole("button", { name: "Responsable de turno Rol" }))
    .toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("shows the selected option's own label as the trigger's value", async () => {
  const screen = await render(<Select {...baseProps({ value: "cashier" })} />);
  const trigger = screen.getByRole("button", { name: /Rol/ });

  await expect.element(trigger.getByText("Atención de caja", { exact: true })).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("shows the hand cursor on the trigger and on each option", async () => {
  const screen = await render(<Select {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Rol/ }).element() as HTMLElement;
  expect(getComputedStyle(trigger).cursor).toBe("pointer");

  await screen.getByRole("button", { name: /Rol/ }).click();
  const option = screen.getByRole("option", { name: "Atención de caja" }).element() as HTMLElement;
  expect(getComputedStyle(option).cursor).toBe("pointer");

  await expectNoAccessibilityViolations(document.body);
});

test("lists every option on open, with a check on the selected one only", async () => {
  const screen = await render(<Select {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Rol/ });

  await trigger.click();

  await expect.element(screen.getByRole("listbox")).toBeVisible();
  const optionEls = screen.getByRole("option").elements();
  expect(optionEls.map((el) => el.textContent)).toEqual([
    "Administrador",
    "Responsable de turno",
    "Atención de caja",
  ]);

  const chosen = screen.getByRole("option", { name: "Responsable de turno" }).element();
  const unchosen = screen.getByRole("option", { name: "Administrador" }).element();
  expect(chosen.querySelector("svg")).not.toBeNull();
  expect(unchosen.querySelector("svg")).toBeNull();

  await expectNoAccessibilityViolations(document.body);
});

test("gives the caller the chosen option's value and closes the menu, on click", async () => {
  const onChange = vi.fn();
  const screen = await render(<Select {...baseProps({ onChange })} />);
  const trigger = screen.getByRole("button", { name: /Rol/ });

  await trigger.click();
  await screen.getByRole("option", { name: "Atención de caja" }).click();

  expect(onChange).toHaveBeenCalledWith("cashier");
  await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();

  // The popover portals its own DOM outside screen.container while open (see DateField.test.tsx's
  // own comment on this); once closed, nothing of this field is rendered outside the container.
  await expectNoAccessibilityViolations(screen.container);
});

test("opens from the keyboard, moves between options with arrows, picks one with Enter, and returns focus to the trigger", async () => {
  const onChange = vi.fn();
  const screen = await render(<Select {...baseProps({ onChange })} />);
  const trigger = screen.getByRole("button", { name: /Rol/ });

  await userEvent.tab();
  expect(document.activeElement).toBe(trigger.element());

  await userEvent.keyboard("{ArrowDown}");
  await expect.element(screen.getByRole("listbox")).toBeVisible();

  await userEvent.keyboard("{ArrowDown}");
  await userEvent.keyboard("{Enter}");

  expect(onChange).toHaveBeenCalledWith("cashier");
  await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();
  await expect.poll(() => document.activeElement).toBe(trigger.element());

  await expectNoAccessibilityViolations(screen.container);
});

test("closes on Escape without changing anything", async () => {
  const onChange = vi.fn();
  const screen = await render(<Select {...baseProps({ onChange })} />);
  await screen.getByRole("button", { name: /Rol/ }).click();
  await expect.element(screen.getByRole("listbox")).toBeVisible();

  await userEvent.keyboard("{Escape}");

  expect(onChange).not.toHaveBeenCalled();
  await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();

  await expectNoAccessibilityViolations(screen.container);
});

test("marks a required select with an asterisk that folds into the trigger's own accessible name", async () => {
  const screen = await render(<Select {...baseProps({ required: true })} />);
  const label = screen.getByText("Rol", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(label, "::after").content).toContain("*");
  // The generated asterisk folds into the trigger's own accessible name (the browser reads
  // ::after content as part of accname computation), the same way TextField.tsx's own asterisk
  // does - a plain "Rol" query would no longer match here on its own.
  await expect
    .element(screen.getByRole("button", { name: /Responsable de turno Rol\s*\*/ }))
    .toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("shows the error message instead of the helper text and announces the select as invalid", async () => {
  const screen = await render(
    <Select
      {...baseProps({ helperText: "Should not be visible." })}
      invalid
      errorMessage="Elegí un rol."
    />,
  );
  const trigger = screen.getByRole("button", { name: /Rol/ }).element() as HTMLElement;

  expect(screen.getByText("Elegí un rol.").element()).toBeTruthy();
  expect(screen.getByText("Should not be visible.").query()).toBeNull();

  const describedBy = trigger.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  const describedText = (describedBy as string)
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
  expect(describedText).toContain("Elegí un rol.");

  await expectNoAccessibilityViolations(screen.container);
});

test("dims the field and blocks focus when disabled", async () => {
  const screen = await render(
    <>
      <Select {...baseProps({ disabled: true })} />
      <button type="button">Next control</button>
    </>,
  );
  const trigger = screen.getByRole("button", { name: /Rol/ }).element() as HTMLElement;
  const wrapper = trigger.parentElement as HTMLElement;
  const nextControl = screen.getByRole("button", { name: "Next control" }).element();

  expect(getComputedStyle(wrapper).opacity).toBe("0.45");
  expect(trigger.hasAttribute("disabled")).toBe(true);

  await userEvent.tab();
  expect(document.activeElement).toBe(nextControl);
  expect(document.activeElement).not.toBe(trigger);

  await expectNoAccessibilityViolations(screen.container);
});

// The trigger is a real <button>, so its boundary is a real border rather than TextField's inset
// shadow; these read the border every state paints and prove no outline ring is ever drawn.
function borderOf(trigger: HTMLElement) {
  const style = getComputedStyle(trigger);
  return { width: style.borderWidth, color: style.borderColor };
}

test("draws a white trigger with a 2px line border at rest, like every other field", async () => {
  const screen = await render(<Select {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Rol/ }).element() as HTMLElement;

  expect(getComputedStyle(trigger).backgroundColor).toBe(tokenRgb("surface-white"));
  expect(borderOf(trigger)).toEqual({ width: "2px", color: tokenRgb("line") });

  await expectNoAccessibilityViolations(screen.container);
});

test("turns the trigger bone on hover, keeping the same 2px line border", async () => {
  const screen = await render(<Select {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Rol/ }).element() as HTMLElement;

  await userEvent.hover(trigger);

  await expect.poll(() => getComputedStyle(trigger).backgroundColor).toBe(tokenRgb("surface-bone"));
  expect(borderOf(trigger)).toEqual({ width: "2px", color: tokenRgb("line") });
});

test("draws a 2px brand-blue-ui border and no outline ring when reached by keyboard", async () => {
  const screen = await render(<Select {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Rol/ }).element() as HTMLElement;

  await userEvent.tab();

  expect(document.activeElement).toBe(trigger);
  await expect
    .poll(() => borderOf(trigger))
    .toEqual({
      width: "2px",
      color: tokenRgb("brand-blue-ui"),
    });
  expect(getComputedStyle(trigger).outlineStyle).toBe("none");
  expect(getComputedStyle(trigger).backgroundColor).toBe(tokenRgb("surface-white"));

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the focused border and white fill instead of the hovered bone one when both apply at once", async () => {
  const screen = await render(<Select {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Rol/ }).element() as HTMLElement;

  await userEvent.tab();
  await userEvent.hover(trigger);
  // Both assertions below also hold for a focused trigger the pointer never reached, so the hover
  // itself is proven first; otherwise a dropped hover would leave this test green.
  await expect.poll(() => trigger.hasAttribute("data-hovered")).toBe(true);

  await expect.poll(() => borderOf(trigger).color).toBe(tokenRgb("brand-blue-ui"));
  expect(getComputedStyle(trigger).backgroundColor).toBe(tokenRgb("surface-white"));
});

test("keeps the focused border while its menu is open", async () => {
  const screen = await render(<Select {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Rol/ }).element() as HTMLElement;

  await userEvent.click(trigger);
  await expect.element(screen.getByRole("listbox")).toBeVisible();

  expect(document.activeElement).not.toBe(trigger);
  expect(borderOf(trigger)).toEqual({ width: "2px", color: tokenRgb("brand-blue-ui") });
});

test("switches the border to the error tone while invalid", async () => {
  const screen = await render(<Select {...baseProps()} invalid errorMessage="Elegí un rol." />);
  const trigger = screen.getByRole("button", { name: /Rol/ }).element() as HTMLElement;

  expect(borderOf(trigger)).toEqual({ width: "2px", color: tokenRgb("status-error-ui") });

  await expectNoAccessibilityViolations(screen.container);
});

test("turns an invalid trigger bone on hover, keeping its error border", async () => {
  const screen = await render(<Select {...baseProps()} invalid errorMessage="Elegí un rol." />);
  const trigger = screen.getByRole("button", { name: /Rol/ }).element() as HTMLElement;

  await userEvent.hover(trigger);

  await expect.poll(() => getComputedStyle(trigger).backgroundColor).toBe(tokenRgb("surface-bone"));
  expect(borderOf(trigger)).toEqual({ width: "2px", color: tokenRgb("status-error-ui") });
});

test("shows the focused border instead of the error one while an invalid select's menu is open", async () => {
  const screen = await render(<Select {...baseProps()} invalid errorMessage="Elegí un rol." />);
  const trigger = screen.getByRole("button", { name: /Rol/ }).element() as HTMLElement;

  await userEvent.click(trigger);
  await expect.element(screen.getByRole("listbox")).toBeVisible();

  expect(borderOf(trigger)).toEqual({ width: "2px", color: tokenRgb("brand-blue-ui") });
});

test("shows the focused border instead of the error one once an invalid select is focused", async () => {
  const screen = await render(<Select {...baseProps()} invalid errorMessage="Elegí un rol." />);
  const trigger = screen.getByRole("button", { name: /Rol/ }).element() as HTMLElement;

  await userEvent.tab();

  await expect.poll(() => borderOf(trigger).color).toBe(tokenRgb("brand-blue-ui"));
});

test("keeps the 2px line border while disabled", async () => {
  const screen = await render(<Select {...baseProps({ disabled: true })} />);
  const trigger = screen.getByRole("button", { name: /Rol/ }).element() as HTMLElement;

  expect(borderOf(trigger)).toEqual({ width: "2px", color: tokenRgb("line") });
});

test("paints its open popover above a surrounding stacking context that sets a lower positive z-index, the way Modal.tsx's own overlay does", async () => {
  const screen = await render(
    <div style={{ position: "relative", zIndex: 50 }}>
      <Select {...baseProps()} />
    </div>,
  );

  await screen.getByRole("button", { name: /Rol/ }).click();
  const option = screen.getByRole("option", { name: "Administrador" }).element() as HTMLElement;
  const rect = option.getBoundingClientRect();

  const probe = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  expect(probe?.closest('[role="option"]')).toBe(option);

  await expectNoAccessibilityViolations(document.body);
});

test("does not accept a select without a label, its options, a chosen value or an onChange handler", () => {
  expectTypeOf<{
    options: typeof options;
    value: Role;
    onChange: (value: Role) => void;
  }>().not.toExtend<SelectProps<Role>>();
  expectTypeOf<{
    label: string;
    value: Role;
    onChange: (value: Role) => void;
  }>().not.toExtend<SelectProps<Role>>();
  expectTypeOf<{
    label: string;
    options: typeof options;
    onChange: (value: Role) => void;
  }>().not.toExtend<SelectProps<Role>>();
  expectTypeOf<{
    label: string;
    options: typeof options;
    value: Role;
  }>().not.toExtend<SelectProps<Role>>();
});

test("does not accept an empty options list", () => {
  expectTypeOf<{
    label: string;
    options: [];
    value: Role;
    onChange: (value: Role) => void;
  }>().not.toExtend<SelectProps<Role>>();
});

test("does not accept an invalid select without an error message", () => {
  expectTypeOf<{
    label: string;
    options: typeof options;
    value: Role;
    onChange: (value: Role) => void;
    invalid: true;
  }>().not.toExtend<SelectProps<Role>>();
});

test("accepts a null value for no selection yet", () => {
  expectTypeOf<{
    label: string;
    options: typeof options;
    value: null;
    onChange: (value: Role) => void;
  }>().toExtend<SelectProps<Role>>();
});

test("shows the caller's placeholder as the trigger's value, styled as inert placeholder text, when nothing is chosen", async () => {
  const screen = await render(
    <Select {...baseProps({ value: null, placeholder: "Elegí un rol" })} />,
  );
  const trigger = screen.getByRole("button", { name: "Elegí un rol Rol" }).element() as HTMLElement;

  await expect.element(screen.getByRole("button", { name: "Elegí un rol Rol" })).toBeVisible();
  const valueEl = trigger.querySelector("[data-placeholder]") as HTMLElement;
  expect(valueEl).not.toBeNull();
  expect(getComputedStyle(valueEl).color).toBe(tokenRgb("ink-secondary"));

  await expectNoAccessibilityViolations(screen.container);
});

test("does not call onChange or select anything on its own when the value starts out null", async () => {
  const onChange = vi.fn();
  const screen = await render(
    <Select {...baseProps({ value: null, placeholder: "Elegí un rol", onChange })} />,
  );

  await expect.element(screen.getByRole("button", { name: "Elegí un rol Rol" })).toBeVisible();
  expect(onChange).not.toHaveBeenCalled();

  await expectNoAccessibilityViolations(screen.container);
});

test("shows the error message and closes-with-choice still works when the value starts out null", async () => {
  const onChange = vi.fn();
  const screen = await render(
    <Select
      {...baseProps({ value: null, placeholder: "Elegí un rol", onChange })}
      invalid
      errorMessage="Elegí un rol."
    />,
  );

  expect(screen.getByText("Elegí un rol.").element()).toBeTruthy();

  await screen.getByRole("button", { name: /Rol/ }).click();
  await screen.getByRole("option", { name: "Atención de caja" }).click();

  expect(onChange).toHaveBeenCalledWith("cashier");

  await expectNoAccessibilityViolations(screen.container);
});
