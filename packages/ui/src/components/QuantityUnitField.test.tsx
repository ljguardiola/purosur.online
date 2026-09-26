import { useState } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { insetBoundary, paintedBoxShadowLayers, tokenRgb } from "../test/token-colors";
import {
  QuantityUnitField,
  type QuantityUnitFieldOption,
  type QuantityUnitFieldProps,
} from "./QuantityUnitField";

type Unit = "g" | "kg" | "ml" | "l" | "u";

const unitOptions: [QuantityUnitFieldOption<Unit>, ...QuantityUnitFieldOption<Unit>[]] = [
  { id: "g", label: "g" },
  { id: "kg", label: "kg" },
  { id: "ml", label: "ml" },
  { id: "l", label: "l" },
  { id: "u", label: "u" },
];

type Screen = Awaited<ReturnType<typeof render>>;

// A plain (never-invalid) shape rather than `Partial<QuantityUnitFieldProps<Unit>>`: Partial
// flattens the validity union's three variants into one where `errorMessageId` types as
// `string | undefined` regardless of variant, which then fails `exactOptionalPropertyTypes`
// wherever a test spreads this and adds its own `invalid`/`errorMessage` JSX attributes on top.
type BaseFieldProps = {
  label: string;
  quantity: string;
  onQuantityChange: (value: string) => void;
  unit: Unit;
  onUnitChange: (value: Unit) => void;
  options: readonly [QuantityUnitFieldOption<Unit>, ...QuantityUnitFieldOption<Unit>[]];
  unitLabel: string;
  helperText?: string;
  disabled?: boolean;
};

function baseProps(overrides: Partial<BaseFieldProps> = {}): BaseFieldProps {
  return {
    label: "Contenido neto",
    quantity: "",
    onQuantityChange: () => {},
    unit: "g",
    onUnitChange: () => {},
    options: unitOptions,
    unitLabel: "Unidad",
    ...overrides,
  };
}

function quantityInput(screen: Screen): HTMLInputElement {
  return screen.getByRole("textbox", { name: "Contenido neto" }).element() as HTMLInputElement;
}

function fieldBox(screen: Screen): HTMLElement {
  return quantityInput(screen).parentElement as HTMLElement;
}

function unitTrigger(screen: Screen) {
  return screen.getByRole("button", { name: /Unidad/ });
}

function describedText(element: HTMLElement): string {
  const describedBy = element.getAttribute("aria-describedby");
  if (!describedBy) {
    return "";
  }
  return describedBy
    .split(" ")
    .map((id) => {
      const described = document.getElementById(id);
      if (described === null) {
        throw new Error(`aria-describedby names "${id}", which is not in the document`);
      }
      return described.textContent ?? "";
    })
    .join(" ");
}

test("labels the quantity input with the field's own visible label", async () => {
  const screen = await render(<QuantityUnitField {...baseProps()} />);

  await expect.element(screen.getByText("Contenido neto")).toBeVisible();
  await expect.element(screen.getByRole("textbox", { name: "Contenido neto" })).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("names the unit picker by both its chosen option and the caller's own unitLabel", async () => {
  const screen = await render(<QuantityUnitField {...baseProps({ unit: "kg" })} />);

  await expect.element(screen.getByRole("button", { name: "kg Unidad" })).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("draws the box at the 48px backoffice field scale with a 2px line border", async () => {
  const screen = await render(<QuantityUnitField {...baseProps()} />);
  const box = fieldBox(screen);
  const style = getComputedStyle(box);

  expect(box.getBoundingClientRect().height).toBeCloseTo(48, 0);
  expect(Math.round(Number.parseFloat(style.paddingLeft))).toBe(12);
  expect(Math.round(Number.parseFloat(style.paddingRight))).toBe(12);
  expect(Math.round(Number.parseFloat(style.columnGap))).toBe(8);
  expect(style.borderRadius).toBe("8px");
  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(paintedBoxShadowLayers(box)).toEqual([insetBoundary("line", "2px")]);

  await expectNoAccessibilityViolations(screen.container);
});

test("shows the quantity value left-aligned in bold ink, and the unit beside a chevron-down in ink-secondary", async () => {
  const screen = await render(<QuantityUnitField {...baseProps({ quantity: "380", unit: "g" })} />);
  const input = quantityInput(screen);
  const inputStyle = getComputedStyle(input);
  const trigger = unitTrigger(screen).element() as HTMLElement;
  const unitText = trigger.querySelector("span") as HTMLElement;
  const unitStyle = getComputedStyle(unitText);

  expect(input.value).toBe("380");
  expect(inputStyle.textAlign).toBe("left");
  expect(Math.round(Number.parseFloat(inputStyle.fontSize))).toBe(16);
  expect(inputStyle.fontWeight).toBe("600");
  expect(inputStyle.color).toBe(tokenRgb("ink"));

  expect(Math.round(Number.parseFloat(unitStyle.fontSize))).toBe(16);
  expect(unitStyle.color).toBe(tokenRgb("ink-secondary"));

  const chevron = trigger.querySelector("svg") as SVGElement;
  expect(chevron).not.toBeNull();
  expect(chevron.getAttribute("aria-hidden")).toBe("true");

  await expectNoAccessibilityViolations(screen.container);
});

function QuantityHarness({ initial = "" }: { initial?: string }) {
  const [quantity, setQuantity] = useState(initial);
  return <QuantityUnitField {...baseProps({ quantity, onQuantityChange: setQuantity })} />;
}

test("reports exactly what was typed into the quantity input, unformatted", async () => {
  const screen = await render(<QuantityHarness />);

  await userEvent.click(quantityInput(screen));
  await userEvent.keyboard("380,5");

  expect(quantityInput(screen).value).toBe("380,5");
  await expectNoAccessibilityViolations(screen.container);
});

test("lists every option on open, with a check on the selected one only", async () => {
  const screen = await render(<QuantityUnitField {...baseProps({ unit: "kg" })} />);

  await unitTrigger(screen).click();

  await expect.element(screen.getByRole("listbox")).toBeVisible();
  const optionEls = screen.getByRole("option").elements();
  expect(optionEls.map((el) => el.textContent)).toEqual(["g", "kg", "ml", "l", "u"]);

  const chosen = screen.getByRole("option", { name: "kg" }).element();
  const unchosen = screen.getByRole("option", { name: "g" }).element();
  expect(chosen.querySelector("svg")).not.toBeNull();
  expect(unchosen.querySelector("svg")).toBeNull();

  await expectNoAccessibilityViolations(document.body);
});

test("gives the caller the chosen unit's id and closes the menu, on click", async () => {
  const onUnitChange = vi.fn();
  const screen = await render(<QuantityUnitField {...baseProps({ onUnitChange })} />);

  await unitTrigger(screen).click();
  await screen.getByRole("option", { name: "l" }).click();

  expect(onUnitChange).toHaveBeenCalledWith("l");
  await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();

  await expectNoAccessibilityViolations(screen.container);
});

test("opens the unit menu from the keyboard, moves with arrows, picks with Enter, and returns focus to the trigger", async () => {
  const onUnitChange = vi.fn();
  const screen = await render(<QuantityUnitField {...baseProps({ onUnitChange })} />);
  const trigger = unitTrigger(screen);

  await userEvent.tab();
  await userEvent.tab();
  expect(document.activeElement).toBe(trigger.element());

  await userEvent.keyboard("{ArrowDown}");
  await expect.element(screen.getByRole("listbox")).toBeVisible();

  await userEvent.keyboard("{ArrowDown}");
  await userEvent.keyboard("{Enter}");

  expect(onUnitChange).toHaveBeenCalledWith("kg");
  await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();
  await expect.poll(() => document.activeElement).toBe(trigger.element());

  await expectNoAccessibilityViolations(screen.container);
});

test("closes the unit menu on Escape without changing anything", async () => {
  const onUnitChange = vi.fn();
  const screen = await render(<QuantityUnitField {...baseProps({ onUnitChange })} />);

  await unitTrigger(screen).click();
  await expect.element(screen.getByRole("listbox")).toBeVisible();

  await userEvent.keyboard("{Escape}");

  await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();
  expect(onUnitChange).not.toHaveBeenCalled();

  await expectNoAccessibilityViolations(screen.container);
});

test("dims the whole field and blocks focus on both the quantity input and the unit trigger when disabled", async () => {
  const screen = await render(
    <>
      <QuantityUnitField {...baseProps({ disabled: true })} />
      <button type="button">Next control</button>
    </>,
  );
  const wrapper = fieldBox(screen).parentElement as HTMLElement;
  const input = quantityInput(screen);
  const trigger = unitTrigger(screen).element() as HTMLElement;
  const nextControl = screen.getByRole("button", { name: "Next control" }).element();

  expect(getComputedStyle(wrapper).opacity).toBe("0.45");
  expect(input.disabled).toBe(true);
  expect(trigger.hasAttribute("disabled")).toBe(true);

  await userEvent.tab();
  expect(document.activeElement).toBe(nextControl);

  await expectNoAccessibilityViolations(screen.container);
});

test("shows the error message instead of helper text, describing both the quantity input and the unit trigger", async () => {
  const screen = await render(
    <QuantityUnitField
      {...baseProps({ helperText: "Should not be visible." })}
      invalid
      errorMessage="Ingresá una cantidad válida."
    />,
  );
  const input = quantityInput(screen);
  const trigger = unitTrigger(screen).element() as HTMLElement;

  expect(screen.getByText("Ingresá una cantidad válida.").element()).toBeTruthy();
  expect(screen.getByText("Should not be visible.").query()).toBeNull();
  expect(describedText(input)).toContain("Ingresá una cantidad válida.");
  expect(describedText(trigger)).toContain("Ingresá una cantidad válida.");
  expect(input.getAttribute("aria-invalid")).toBe("true");

  await expectNoAccessibilityViolations(screen.container);
});

test("wires the helper text as both controls' description when the field is not invalid", async () => {
  const screen = await render(
    <QuantityUnitField {...baseProps({ helperText: "Nunca afecta el precio ni el stock." })} />,
  );
  const input = quantityInput(screen);
  const trigger = unitTrigger(screen).element() as HTMLElement;

  expect(describedText(input)).toContain("Nunca afecta el precio ni el stock.");
  expect(describedText(trigger)).toContain("Nunca afecta el precio ni el stock.");

  await expectNoAccessibilityViolations(screen.container);
});

test("describes the field by a shared message rendered outside it through errorMessageId", async () => {
  const screen = await render(
    <>
      <QuantityUnitField {...baseProps()} invalid errorMessageId="net-content-error" />
      <p id="net-content-error">Compartido por otro campo.</p>
    </>,
  );
  const input = quantityInput(screen);
  const trigger = unitTrigger(screen).element() as HTMLElement;

  expect(describedText(input)).toBe("Compartido por otro campo.");
  expect(describedText(trigger)).toBe("Compartido por otro campo.");
  // The field renders no copy of its own of a message the caller already renders elsewhere.
  expect(fieldBox(screen).parentElement?.textContent).not.toContain("Compartido por otro campo.");

  await expectNoAccessibilityViolations(screen.container);
});

test("turns the box bone on hover, keeping the same 2px line border", async () => {
  const screen = await render(<QuantityUnitField {...baseProps()} />);
  const box = fieldBox(screen);

  await userEvent.hover(box);

  await expect.poll(() => getComputedStyle(box).backgroundColor).toBe(tokenRgb("surface-bone"));
  expect(paintedBoxShadowLayers(box)).toEqual([insetBoundary("line", "2px")]);
});

test("draws a brand-blue-ui border with no outer shadow when the quantity input is focused", async () => {
  const screen = await render(<QuantityUnitField {...baseProps()} />);
  const box = fieldBox(screen);

  await userEvent.click(quantityInput(screen));

  await expect
    .poll(() => paintedBoxShadowLayers(box))
    .toEqual([insetBoundary("brand-blue-ui", "2px")]);
});

test("keeps the brand-blue-ui border while the unit menu is open, even though DOM focus moves into its portaled listbox", async () => {
  const screen = await render(<QuantityUnitField {...baseProps()} />);
  const box = fieldBox(screen);

  await unitTrigger(screen).click();
  const listbox = screen.getByRole("listbox");
  await expect.element(listbox).toBeVisible();

  await expect.poll(() => listbox.element().contains(document.activeElement)).toBe(true);
  expect(paintedBoxShadowLayers(box)).toEqual([insetBoundary("brand-blue-ui", "2px")]);
});

test("switches the box border to the error tone while invalid, then to focused once the quantity input is focused", async () => {
  const screen = await render(
    <QuantityUnitField {...baseProps()} invalid errorMessage="Ingresá una cantidad válida." />,
  );
  const box = fieldBox(screen);

  expect(paintedBoxShadowLayers(box)).toEqual([insetBoundary("status-error-ui", "2px")]);

  await userEvent.click(quantityInput(screen));

  await expect
    .poll(() => paintedBoxShadowLayers(box))
    .toEqual([insetBoundary("brand-blue-ui", "2px")]);
});

test("does not accept a field without a label, quantity, unit, options, unitLabel or their change handlers", () => {
  expectTypeOf<{
    quantity: string;
    onQuantityChange: (value: string) => void;
    unit: Unit;
    onUnitChange: (value: Unit) => void;
    options: typeof unitOptions;
    unitLabel: string;
  }>().not.toExtend<QuantityUnitFieldProps<Unit>>();
  expectTypeOf<{
    label: string;
    onQuantityChange: (value: string) => void;
    unit: Unit;
    onUnitChange: (value: Unit) => void;
    options: typeof unitOptions;
    unitLabel: string;
  }>().not.toExtend<QuantityUnitFieldProps<Unit>>();
  expectTypeOf<{
    label: string;
    quantity: string;
    unit: Unit;
    onUnitChange: (value: Unit) => void;
    options: typeof unitOptions;
    unitLabel: string;
  }>().not.toExtend<QuantityUnitFieldProps<Unit>>();
  expectTypeOf<{
    label: string;
    quantity: string;
    onQuantityChange: (value: string) => void;
    onUnitChange: (value: Unit) => void;
    options: typeof unitOptions;
    unitLabel: string;
  }>().not.toExtend<QuantityUnitFieldProps<Unit>>();
  expectTypeOf<{
    label: string;
    quantity: string;
    onQuantityChange: (value: string) => void;
    unit: Unit;
    options: typeof unitOptions;
    unitLabel: string;
  }>().not.toExtend<QuantityUnitFieldProps<Unit>>();
  expectTypeOf<{
    label: string;
    quantity: string;
    onQuantityChange: (value: string) => void;
    unit: Unit;
    onUnitChange: (value: Unit) => void;
    unitLabel: string;
  }>().not.toExtend<QuantityUnitFieldProps<Unit>>();
  expectTypeOf<{
    label: string;
    quantity: string;
    onQuantityChange: (value: string) => void;
    unit: Unit;
    onUnitChange: (value: Unit) => void;
    options: typeof unitOptions;
  }>().not.toExtend<QuantityUnitFieldProps<Unit>>();
});

test("does not accept an empty options list", () => {
  expectTypeOf<{
    label: string;
    quantity: string;
    onQuantityChange: (value: string) => void;
    unit: Unit;
    onUnitChange: (value: Unit) => void;
    options: [];
    unitLabel: string;
  }>().not.toExtend<QuantityUnitFieldProps<Unit>>();
});

test("does not accept an invalid field without an error message of its own or a shared one", () => {
  expectTypeOf<{
    label: string;
    quantity: string;
    onQuantityChange: (value: string) => void;
    unit: Unit;
    onUnitChange: (value: Unit) => void;
    options: typeof unitOptions;
    unitLabel: string;
    invalid: true;
  }>().not.toExtend<QuantityUnitFieldProps<Unit>>();
});

test("does not accept an invalid field with both its own message and a shared one", () => {
  expectTypeOf<{
    label: string;
    quantity: string;
    onQuantityChange: (value: string) => void;
    unit: Unit;
    onUnitChange: (value: Unit) => void;
    options: typeof unitOptions;
    unitLabel: string;
    invalid: true;
    errorMessage: string;
    errorMessageId: string;
  }>().not.toExtend<QuantityUnitFieldProps<Unit>>();
});

test("accepts an invalid field whose message is shared through errorMessageId", () => {
  expectTypeOf<{
    label: string;
    quantity: string;
    onQuantityChange: (value: string) => void;
    unit: Unit;
    onUnitChange: (value: Unit) => void;
    options: typeof unitOptions;
    unitLabel: string;
    invalid: true;
    errorMessageId: string;
  }>().toExtend<QuantityUnitFieldProps<Unit>>();
});
