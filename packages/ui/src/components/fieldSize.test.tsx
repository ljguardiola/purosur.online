import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { tokenRgb } from "../test/token-colors";
import { DateField } from "./DateField";
import { FieldSizeProvider } from "./fieldSize";
import { Select } from "./Select";
import { TextField } from "./TextField";

// TextField, DateField and Select all draw the backoffice frame from the one shared definition in
// fieldSize.ts: this is the only place that measures it, so no component repeats these numbers as
// its own "matches X exactly" comment.
test("draws the label, gap, box and value at the backoffice size, identically for TextField, DateField and Select", async () => {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <TextField kind="plain-text" label="Text" value="" onChange={() => {}} />
      <DateField label="Date" value={null} onChange={() => {}} />
      <Select label="Choice" options={[{ value: "a", label: "A" }]} value="a" onChange={() => {}} />
    </FieldSizeProvider>,
  );

  const textLabel = screen.getByText("Text").element() as HTMLElement;
  const textInput = screen.getByRole("textbox", { name: "Text" }).element() as HTMLElement;
  const textBox = textInput.parentElement as HTMLElement;
  const textWrapper = textBox.parentElement as HTMLElement;

  const dateLabel = screen.getByText("Date").element() as HTMLElement;
  const dateGroup = screen.getByRole("group", { name: "Date" }).element() as HTMLElement;
  const dateWrapper = dateGroup.parentElement as HTMLElement;
  const dateInput = (dateGroup.querySelector('[role="spinbutton"]') as HTMLElement)
    .parentElement as HTMLElement;

  const selectLabel = screen.getByText("Choice", { exact: true }).element() as HTMLElement;
  const selectTriggerLocator = screen.getByRole("button", { name: /Choice/ });
  const selectTrigger = selectTriggerLocator.element() as HTMLElement;
  const selectValue = selectTriggerLocator.getByText("A", { exact: true }).element() as HTMLElement;
  const selectWrapper = selectTrigger.parentElement as HTMLElement;

  for (const label of [textLabel, dateLabel, selectLabel]) {
    const style = getComputedStyle(label);
    expect(Math.round(Number.parseFloat(style.fontSize))).toBe(14);
    expect(style.fontWeight).toBe("700");
    expect(style.color).toBe(tokenRgb("ink"));
  }

  for (const wrapper of [textWrapper, dateWrapper, selectWrapper]) {
    expect(Math.round(Number.parseFloat(getComputedStyle(wrapper).rowGap))).toBe(4);
  }

  expect(textBox.getBoundingClientRect().height).toBeCloseTo(48, 0);
  expect(dateGroup.getBoundingClientRect().height).toBeCloseTo(48, 0);
  expect(selectTrigger.getBoundingClientRect().height).toBeCloseTo(48, 0);

  for (const box of [textBox, dateGroup, selectTrigger]) {
    const style = getComputedStyle(box);
    expect(Math.round(Number.parseFloat(style.paddingLeft))).toBe(12);
    expect(Math.round(Number.parseFloat(style.paddingRight))).toBe(12);
  }

  for (const value of [textInput, dateInput, selectValue]) {
    const style = getComputedStyle(value);
    expect(Math.round(Number.parseFloat(style.fontSize))).toBe(16);
    expect(style.fontWeight).toBe("600");
    expect(style.color).toBe(tokenRgb("ink"));
  }

  await expectNoAccessibilityViolations(screen.container);
});
