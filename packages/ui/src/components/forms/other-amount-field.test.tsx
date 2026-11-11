import { useState } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { OtherAmountField, type OtherAmountFieldProps } from "./other-amount-field";

function field(props: Partial<OtherAmountFieldProps> = {}) {
  return (
    <OtherAmountField
      label="Otro descuento"
      prefix="– $"
      placeholder="Otro"
      keyName="0"
      value=""
      onChange={() => {}}
      {...props}
    />
  );
}

function TypedField({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState("");
  return field({
    value,
    onChange: (typed) => {
      setValue(typed);
      onChange(typed);
    },
  });
}

test("is a text field named by its label, with its placeholder and key shown", async () => {
  const screen = await render(field());

  const input = screen.getByRole("textbox", { name: "Otro descuento" });
  await expect.element(input).toBeVisible();
  await expect.element(input).toHaveAttribute("placeholder", "Otro");
  expect(screen.container.querySelector("kbd")?.textContent).toBe("0");
  await expectNoAccessibilityViolations(screen.container);
});

test("is disabled with its prefix dimmed and still passes the accessibility checks", async () => {
  const screen = await render(field({ disabled: true }));

  await expect.element(screen.getByRole("textbox", { name: "Otro descuento" })).toBeDisabled();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows its prefix before the input and its key after it", async () => {
  const screen = await render(<div style={{ width: 170 }}>{field()}</div>);

  const prefix = screen.getByText("– $").element().getBoundingClientRect();
  const input = screen.getByRole("textbox").element().getBoundingClientRect();
  const key = (screen.container.querySelector("kbd") as HTMLElement).getBoundingClientRect();
  expect(prefix.right).toBeLessThanOrEqual(input.left + 1);
  expect(input.right).toBeLessThanOrEqual(key.left + 1);
});

test("reports what is typed, keeping two decimals", async () => {
  const onChange = vi.fn();
  const screen = await render(<TypedField onChange={onChange} />);

  await userEvent.type(screen.getByRole("textbox"), "1,234");

  expect(onChange).toHaveBeenLastCalledWith("1,23");
});

test("shows the typed value", async () => {
  const screen = await render(field({ value: "150,50" }));

  await expect.element(screen.getByRole("textbox")).toHaveValue("150,50");
});

test("draws a white box with a border while it is not selected and a blue one while it is", async () => {
  const idle = await render(field());
  const idleBox = idle.getByRole("textbox").element().parentElement as HTMLElement;
  expect(getComputedStyle(idleBox).backgroundColor).toBe(tokenRgb("surface"));
  expect(getComputedStyle(idleBox).borderTopColor).toBe(tokenRgb("border"));
  await idle.unmount();

  const selected = await render(field({ selected: true }));
  const selectedBox = selected.getByRole("textbox").element().parentElement as HTMLElement;
  expect(getComputedStyle(selectedBox).backgroundColor).toBe(tokenRgb("action-subtle"));
  expect(getComputedStyle(selectedBox).borderTopColor).toBe(tokenRgb("action"));
});

test("shows an error message in place of nothing and marks the input invalid", async () => {
  const screen = await render(field({ errorMessage: "Ingresá un importe válido." }));

  await expect.element(screen.getByText("Ingresá un importe válido.")).toBeVisible();
  await expect.element(screen.getByRole("textbox")).toBeInvalid();
});

test("requires a label, a prefix, a placeholder, a value and a change handler", () => {
  expectTypeOf<Omit<OtherAmountFieldProps, "label">>().not.toExtend<OtherAmountFieldProps>();
  expectTypeOf<Omit<OtherAmountFieldProps, "prefix">>().not.toExtend<OtherAmountFieldProps>();
  expectTypeOf<Omit<OtherAmountFieldProps, "placeholder">>().not.toExtend<OtherAmountFieldProps>();
  expectTypeOf<Omit<OtherAmountFieldProps, "value">>().not.toExtend<OtherAmountFieldProps>();
  expectTypeOf<Omit<OtherAmountFieldProps, "onChange">>().not.toExtend<OtherAmountFieldProps>();
});
