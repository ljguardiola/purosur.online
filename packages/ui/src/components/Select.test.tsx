import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { contrastRatio, NON_TEXT_CONTRAST } from "../styles/contrast";
import { expectNoAccessibilityViolations } from "../test/axe";
import { rgbToHex, tokenRgb } from "../test/token-colors";
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

test("shows a visible focus outline in strong blue when reached by keyboard", async () => {
  const screen = await render(<Select {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Rol/ }).element() as HTMLElement;

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(trigger).outlineWidth).toBe("3px");
  await expect.poll(() => getComputedStyle(trigger).outlineOffset).toBe("3px");
  await expect
    .poll(() => getComputedStyle(trigger).outlineColor)
    .toBe(tokenRgb("brand-blue-strong"));

  await expectNoAccessibilityViolations(screen.container);
});

test("draws the trigger's border at a real 3:1 non-text contrast against its white fill", async () => {
  const screen = await render(<Select {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Rol/ }).element() as HTMLElement;
  const style = getComputedStyle(trigger);

  expect(style.borderWidth).toBe("2px");
  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(
    contrastRatio(rgbToHex(style.borderColor), rgbToHex(style.backgroundColor)),
  ).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);

  await expectNoAccessibilityViolations(screen.container);
});

test("switches the border to the error tone while invalid", async () => {
  const screen = await render(<Select {...baseProps()} invalid errorMessage="Elegí un rol." />);
  const trigger = screen.getByRole("button", { name: /Rol/ }).element() as HTMLElement;

  expect(getComputedStyle(trigger).borderColor).toBe(tokenRgb("status-error-ui"));

  await expectNoAccessibilityViolations(screen.container);
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
