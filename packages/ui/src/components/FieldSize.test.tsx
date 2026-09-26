import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { tokenRgb } from "../test/token-colors";
import { DateField } from "./DateField";
import { FieldGroup } from "./FieldGroup";
import { FieldSizeProvider } from "./FieldSize";
import { QuantityUnitField } from "./QuantityUnitField";
import { Select } from "./Select";
import { TextField } from "./TextField";

// TextField, DateField, Select, FieldGroup and QuantityUnitField all draw the backoffice frame
// from the one shared definition in FieldSize.tsx: this is the only place that measures it, so no
// component repeats these numbers as its own "matches X exactly" comment. QuantityUnitField, like
// Select, has no register-scale variant, so it draws this frame regardless of the ambient
// FieldSizeProvider (see its own comment); it is exercised inside one here only to render it
// alongside its siblings for the same computed-style assertions.
test("draws the label, gap, box and value at the backoffice size, identically for TextField, DateField, Select, FieldGroup and QuantityUnitField", async () => {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <TextField kind="plain-text" label="Text" value="" onChange={() => {}} />
      <TextField kind="plain-text" label="Suffixed" value="30" onChange={() => {}} suffix="días" />
      <DateField label="Date" value={null} onChange={() => {}} />
      <Select label="Choice" options={[{ value: "a", label: "A" }]} value="a" onChange={() => {}} />
      <FieldGroup label="Group">
        <p>Miel</p>
      </FieldGroup>
      <QuantityUnitField
        label="Contenido neto"
        quantity="380"
        onQuantityChange={() => {}}
        unit="g"
        onUnitChange={() => {}}
        options={[{ id: "g", label: "g" }]}
        unitLabel="Unidad"
      />
    </FieldSizeProvider>,
  );

  const textLabel = screen.getByText("Text").element() as HTMLElement;
  const textInput = screen.getByRole("textbox", { name: "Text" }).element() as HTMLElement;
  const textBox = textInput.parentElement as HTMLElement;
  const textWrapper = textBox.parentElement as HTMLElement;

  const suffixedInput = screen.getByRole("textbox", { name: "Suffixed" }).element() as HTMLElement;
  const suffixedBox = suffixedInput.parentElement as HTMLElement;
  const suffix = suffixedBox.querySelector('[aria-hidden="true"]') as HTMLElement;

  const dateLabel = screen.getByText("Date").element() as HTMLElement;
  const dateGroup = screen.getByRole("group", { name: "Date" }).element() as HTMLElement;
  const dateWrapper = dateGroup.parentElement as HTMLElement;
  const dateInput = (dateGroup.querySelector('[role="spinbutton"]') as HTMLElement)
    .parentElement as HTMLElement;

  const selectLabel = screen.getByText("Choice", { exact: true }).element() as HTMLElement;
  const selectTriggerLocator = screen.getByRole("button", { name: /Choice/ });
  const selectTrigger = selectTriggerLocator.element() as HTMLElement;
  const selectValue = selectTriggerLocator.getByText("A", { exact: true }).element() as HTMLElement;
  const selectChevron = selectTrigger.querySelector("svg") as SVGSVGElement;
  const selectWrapper = selectTrigger.parentElement as HTMLElement;

  const groupLabel = screen.getByText("Group").element() as HTMLElement;
  const groupWrapper = groupLabel.parentElement as HTMLElement;

  const quantityLabel = screen.getByText("Contenido neto").element() as HTMLElement;
  const quantityInput = screen
    .getByRole("textbox", { name: "Contenido neto" })
    .element() as HTMLElement;
  const quantityBox = quantityInput.parentElement as HTMLElement;
  const quantityWrapper = quantityBox.parentElement as HTMLElement;

  for (const label of [textLabel, dateLabel, selectLabel, groupLabel, quantityLabel]) {
    const style = getComputedStyle(label);
    expect(Math.round(Number.parseFloat(style.fontSize))).toBe(14);
    expect(style.fontWeight).toBe("700");
    expect(style.color).toBe(tokenRgb("ink"));
  }

  for (const wrapper of [textWrapper, dateWrapper, selectWrapper, groupWrapper, quantityWrapper]) {
    expect(Math.round(Number.parseFloat(getComputedStyle(wrapper).rowGap))).toBe(4);
  }

  expect(textBox.getBoundingClientRect().height).toBeCloseTo(48, 0);
  expect(dateGroup.getBoundingClientRect().height).toBeCloseTo(48, 0);
  expect(selectTrigger.getBoundingClientRect().height).toBeCloseTo(48, 0);
  expect(quantityBox.getBoundingClientRect().height).toBeCloseTo(48, 0);

  for (const box of [textBox, dateGroup, selectTrigger, quantityBox]) {
    const style = getComputedStyle(box);
    expect(Math.round(Number.parseFloat(style.paddingLeft))).toBe(12);
    expect(Math.round(Number.parseFloat(style.paddingRight))).toBe(12);
  }

  for (const value of [textInput, dateInput, selectValue, quantityInput]) {
    const style = getComputedStyle(value);
    expect(Math.round(Number.parseFloat(style.fontSize))).toBe(16);
    expect(style.fontWeight).toBe("600");
    expect(style.color).toBe(tokenRgb("ink"));
  }

  // The shared 8px inner gap (backofficeFieldBoxClassName's own gap-2) sits between the value and
  // whatever trails it inside the box; DateField.test.tsx proves it for the calendar toggle, this
  // proves the same gap for a suffixed plain-text TextField and for Select's own chevron.
  expect(
    suffix.getBoundingClientRect().left - suffixedInput.getBoundingClientRect().right,
  ).toBeCloseTo(8, 0);
  // selectValue is the innermost text-bearing span react-aria-components renders for truncation;
  // its own parent is the flex box the shared gap actually sits against.
  const selectValueBox = selectValue.parentElement as HTMLElement;
  expect(
    selectChevron.getBoundingClientRect().left - selectValueBox.getBoundingClientRect().right,
  ).toBeCloseTo(8, 0);

  await expectNoAccessibilityViolations(screen.container);
});
