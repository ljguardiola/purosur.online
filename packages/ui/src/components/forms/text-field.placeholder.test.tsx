import { useState } from "react";
import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { TextField } from "./text-field";

function Harness() {
  const [value, setValue] = useState("");
  return (
    <TextField
      kind="plain-text"
      label="Código de alta"
      placeholder="Escribí el código del backoffice"
      value={value}
      onChange={setValue}
    />
  );
}

test("shows the placeholder in the empty input while the label stays its accessible name", async () => {
  const screen = await render(<Harness />);

  const input = screen.getByRole("textbox", { name: "Código de alta" }).element();
  expect(input.getAttribute("placeholder")).toBe("Escribí el código del backoffice");
  expect(getComputedStyle(input, "::placeholder").color).toBe(tokenRgb("text-subtle"));
  await expectNoAccessibilityViolations(screen.container);
});

test("leaves the placeholder out of the field's value once something is typed", async () => {
  const screen = await render(<Harness />);

  const input = screen.getByRole("textbox", { name: "Código de alta" });
  await userEvent.fill(input, "4F8K");

  expect((input.element() as HTMLInputElement).value).toBe("4F8K");
  expect((input.element() as HTMLInputElement).matches(":placeholder-shown")).toBe(false);
});

test("has no placeholder unless one is given", async () => {
  const screen = await render(
    <TextField kind="plain-text" label="Nombre" value="" onChange={() => {}} />,
  );

  expect(
    screen.getByRole("textbox", { name: "Nombre" }).element().hasAttribute("placeholder"),
  ).toBe(false);
});
