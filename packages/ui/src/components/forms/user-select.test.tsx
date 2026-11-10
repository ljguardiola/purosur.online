import { useState } from "react";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import type { NarrowedOption } from "./option";
import { UserSelect, type UserSelectProps } from "./user-select";

type Person = "marta" | "lucas" | "ana";

const options: [NarrowedOption<Person>, NarrowedOption<Person>, NarrowedOption<Person>] = [
  { value: "marta", label: "Marta" },
  { value: "lucas", label: "Lucas" },
  { value: "ana", label: "Ana" },
];

function Harness({
  initial = "marta",
  onChange = () => {},
  ...rest
}: { initial?: Person | null } & Partial<Omit<UserSelectProps<Person>, "value">>) {
  const [value, setValue] = useState<Person | null>(initial);
  return (
    <UserSelect
      label="Usuario"
      options={options}
      {...rest}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

test("names the trigger with the chosen person and the label", async () => {
  const screen = await render(<Harness />);

  await expect.element(screen.getByRole("button", { name: /Marta/ })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: /Usuario/ })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows the chosen person's initial in an avatar and the name", async () => {
  const screen = await render(<Harness initial="lucas" />);

  const trigger = screen.getByRole("button", { name: /Usuario/ });
  await expect.element(trigger.getByText("Lucas", { exact: true })).toBeVisible();
  await expect.element(trigger.getByText("L", { exact: true })).toBeVisible();
});

test("shows the placeholder, with no avatar, when nothing is chosen", async () => {
  const screen = await render(<Harness initial={null} placeholder="Elegí una persona" />);

  const trigger = screen.getByRole("button", { name: /Usuario/ });
  await expect.element(trigger.getByText("Elegí una persona")).toBeVisible();
  expect(screen.container.querySelector("[data-avatar]")).toBeNull();
});

test("shows the label text and the up and down keycaps above the trigger", async () => {
  const screen = await render(<Harness />);

  const keycaps = Array.from(screen.container.querySelectorAll("kbd")).map(
    (keycap) => keycap.textContent,
  );
  expect(keycaps).toEqual(["↑", "↓"]);
  await expect.element(screen.getByText("Usuario", { exact: true })).toBeVisible();
});

test("opens a list with each person and their avatar", async () => {
  const screen = await render(<Harness />);

  await userEvent.click(screen.getByRole("button", { name: /Usuario/ }));

  const items = page.getByRole("option");
  await expect.element(items.nth(0)).toHaveTextContent("MMarta");
  await expect.element(items.nth(1)).toHaveTextContent("LLucas");
  await expect.element(items.nth(2)).toHaveTextContent("AAna");
});

test("opens the list with the keyboard", async () => {
  const screen = await render(<Harness />);
  screen.getByRole("button", { name: /Usuario/ }).element().focus();

  await userEvent.keyboard("{Enter}");

  await expect.element(page.getByRole("listbox")).toBeVisible();
});

test("reports the value of the person picked and shows them", async () => {
  const onChange = vi.fn();
  const screen = await render(<Harness onChange={onChange} />);

  await userEvent.click(screen.getByRole("button", { name: /Usuario/ }));
  await userEvent.click(page.getByRole("option", { name: /Lucas/ }));

  expect(onChange).toHaveBeenCalledWith("lucas");
  await expect.element(screen.getByRole("button", { name: /Lucas/ })).toBeVisible();
});

test("does not open when disabled", async () => {
  const screen = await render(<Harness disabled />);

  const trigger = screen.getByRole("button", { name: /Usuario/ });
  expect((trigger.element() as HTMLButtonElement).disabled).toBe(true);
});

test("draws a rounded 64px trigger with a 2px border", async () => {
  const screen = await render(<Harness />);

  const trigger = screen.getByRole("button", { name: /Usuario/ }).element();
  const style = getComputedStyle(trigger);
  expect(trigger.getBoundingClientRect().height).toBe(64);
  expect(style.borderTopWidth).toBe("2px");
  expect(Number.parseFloat(style.borderTopLeftRadius)).toBeGreaterThan(0);
});
