import { useId, useState } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { insetBoundary, paintedBoxShadowLayers, tokenRgb } from "../../test/token-colors";
import type { Option } from "./option";
import { QuantityUnitField, type QuantityUnitFieldProps } from "./quantity-unit-field";

type Unit = "g" | "kg" | "ml" | "l" | "u";

const unitOptions: [Option<Unit>, ...Option<Unit>[]] = [
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "ml", label: "ml" },
  { value: "l", label: "l" },
  { value: "u", label: "u" },
];

type Screen = Awaited<ReturnType<typeof render>>;

// A plain (never-invalid) shape rather than `Partial<QuantityUnitFieldProps<Unit>>`: Partial
// flattens the error union's two variants into one where `errorMessageId` types as
// `string | undefined` regardless of variant, which fails `exactOptionalPropertyTypes` wherever a
// test spreads this and adds its own `errorMessage`/`errorMessageId` JSX attributes on top.
type BaseFieldProps = {
  label: string;
  quantity: string;
  onQuantityChange: (value: string) => void;
  unit: Unit;
  onUnitChange: (value: Unit) => void;
  options: readonly [Option<Unit>, ...Option<Unit>[]];
  unitLabel: string;
  description?: string;
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
});

test("names the unit picker by both its chosen option and the caller's own unitLabel", async () => {
  const screen = await render(<QuantityUnitField {...baseProps({ unit: "kg" })} />);

  await expect.element(screen.getByRole("button", { name: "kg Unidad" })).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("draws the box with an 8px column gap, an 8px radius and a 2px line border", async () => {
  const screen = await render(<QuantityUnitField {...baseProps()} />);
  const box = fieldBox(screen);
  const style = getComputedStyle(box);

  expect(Math.round(Number.parseFloat(style.columnGap))).toBe(8);
  expect(style.borderRadius).toBe("8px");
  expect(style.backgroundColor).toBe(tokenRgb("surface"));
  expect(paintedBoxShadowLayers(box)).toEqual([insetBoundary("border", "2px")]);
});

test("shows the quantity value left-aligned, and the unit beside a chevron-down in subtle text", async () => {
  const screen = await render(<QuantityUnitField {...baseProps({ quantity: "380", unit: "g" })} />);
  const input = quantityInput(screen);
  const inputStyle = getComputedStyle(input);
  const trigger = unitTrigger(screen).element() as HTMLElement;
  const unitText = trigger.querySelector("span") as HTMLElement;
  const unitStyle = getComputedStyle(unitText);

  expect(input.value).toBe("380");
  expect(inputStyle.textAlign).toBe("left");

  expect(Math.round(Number.parseFloat(unitStyle.fontSize))).toBe(16);
  expect(unitStyle.color).toBe(tokenRgb("text-subtle"));

  const chevron = trigger.querySelector("svg") as SVGElement;
  expect(chevron).not.toBeNull();
  expect(chevron.getAttribute("aria-hidden")).toBe("true");
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
});

test("shows the error message instead of helper text, describing both the quantity input and the unit trigger", async () => {
  const screen = await render(
    <QuantityUnitField
      {...baseProps({ description: "Should not be visible." })}
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
});

test("wires the helper text as both controls' description when the field is not invalid", async () => {
  const screen = await render(
    <QuantityUnitField {...baseProps({ description: "Nunca afecta el precio ni el stock." })} />,
  );
  const input = quantityInput(screen);
  const trigger = unitTrigger(screen).element() as HTMLElement;

  expect(describedText(input)).toContain("Nunca afecta el precio ni el stock.");
  expect(describedText(trigger)).toContain("Nunca afecta el precio ni el stock.");
});

function FieldWithSharedErrorMessage() {
  const errorId = useId();
  return (
    <>
      <QuantityUnitField {...baseProps()} errorMessageId={errorId} />
      <p id={errorId}>Compartido por otro campo.</p>
    </>
  );
}

test("describes the field by a shared message rendered outside it through errorMessageId", async () => {
  const screen = await render(<FieldWithSharedErrorMessage />);
  const input = quantityInput(screen);
  const trigger = unitTrigger(screen).element() as HTMLElement;

  expect(describedText(input)).toBe("Compartido por otro campo.");
  expect(describedText(trigger)).toBe("Compartido por otro campo.");
  expect(fieldBox(screen).parentElement?.textContent).not.toContain("Compartido por otro campo.");

  await expectNoAccessibilityViolations(screen.container);
});

test("turns the box bone on hover, keeping the same 2px line border", async () => {
  const screen = await render(<QuantityUnitField {...baseProps()} />);
  const box = fieldBox(screen);

  await userEvent.hover(box);

  await expect.poll(() => getComputedStyle(box).backgroundColor).toBe(tokenRgb("surface-subtle"));
  expect(paintedBoxShadowLayers(box)).toEqual([insetBoundary("border", "2px")]);
});

test("draws an action-color border with no outer shadow when the quantity input is focused", async () => {
  const screen = await render(<QuantityUnitField {...baseProps()} />);
  const box = fieldBox(screen);

  await userEvent.click(quantityInput(screen));

  await expect.poll(() => paintedBoxShadowLayers(box)).toEqual([insetBoundary("action", "2px")]);
});

test("keeps the action-color border while the unit menu is open, even though DOM focus moves into its portaled listbox", async () => {
  const screen = await render(<QuantityUnitField {...baseProps()} />);
  const box = fieldBox(screen);

  await unitTrigger(screen).click();
  const listbox = screen.getByRole("listbox");
  await expect.element(listbox).toBeVisible();

  await expect.poll(() => listbox.element().contains(document.activeElement)).toBe(true);
  expect(paintedBoxShadowLayers(box)).toEqual([insetBoundary("action", "2px")]);
});

test("switches the box border to the error tone while invalid, then to focused once the quantity input is focused", async () => {
  const screen = await render(
    <QuantityUnitField {...baseProps()} errorMessage="Ingresá una cantidad válida." />,
  );
  const box = fieldBox(screen);

  expect(paintedBoxShadowLayers(box)).toEqual([insetBoundary("error", "2px")]);

  await userEvent.click(quantityInput(screen));

  await expect.poll(() => paintedBoxShadowLayers(box)).toEqual([insetBoundary("action", "2px")]);
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

test("has no invalid prop, since an error message or a shared error message id makes the field invalid", () => {
  expectTypeOf<QuantityUnitFieldProps<Unit>>().not.toHaveProperty("invalid");
});

test("does not accept both its own message and a shared one", () => {
  expectTypeOf<{
    label: string;
    quantity: string;
    onQuantityChange: (value: string) => void;
    unit: Unit;
    onUnitChange: (value: Unit) => void;
    options: typeof unitOptions;
    unitLabel: string;
    errorMessage: string;
    errorMessageId: string;
  }>().not.toExtend<QuantityUnitFieldProps<Unit>>();
});

test("accepts an error message, a shared error message id, or neither", () => {
  expectTypeOf<{
    label: string;
    quantity: string;
    onQuantityChange: (value: string) => void;
    unit: Unit;
    onUnitChange: (value: Unit) => void;
    options: typeof unitOptions;
    unitLabel: string;
    errorMessage: string | undefined;
  }>().toExtend<QuantityUnitFieldProps<Unit>>();
  expectTypeOf<{
    label: string;
    quantity: string;
    onQuantityChange: (value: string) => void;
    unit: Unit;
    onUnitChange: (value: Unit) => void;
    options: typeof unitOptions;
    unitLabel: string;
    errorMessageId: string;
  }>().toExtend<QuantityUnitFieldProps<Unit>>();
});

test("does not name its secondary text helperText", () => {
  expectTypeOf<QuantityUnitFieldProps<string>>().not.toHaveProperty("helperText");
});

test("reports the chosen unit option's value", () => {
  expectTypeOf<QuantityUnitFieldProps<Unit>["onUnitChange"]>().parameters.toEqualTypeOf<[Unit]>();
});

test("does not accept a unit option without a value or a label", () => {
  type UnitOptions = QuantityUnitFieldProps<"g">["options"];
  expectTypeOf<[{ label: string }]>().not.toExtend<UnitOptions>();
  expectTypeOf<[{ value: "g" }]>().not.toExtend<UnitOptions>();
  expectTypeOf<[{ id: "g"; label: string }]>().not.toExtend<UnitOptions>();
});
