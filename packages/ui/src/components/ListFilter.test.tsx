import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { tokenBackgroundColor, tokenRgb } from "../test/token-colors";
import { ListFilter, type ListFilterOption, type ListFilterProps } from "./ListFilter";

type Status = "all" | "open" | "closed";

const options: [ListFilterOption<Status>, ListFilterOption<Status>, ListFilterOption<Status>] = [
  { value: "all", label: "Todos" },
  { value: "open", label: "Abiertas" },
  { value: "closed", label: "Cerradas" },
];

function baseProps(overrides: Partial<ListFilterProps<Status>> = {}): ListFilterProps<Status> {
  return {
    label: "Estado",
    options,
    value: "all",
    onChange: () => {},
    ...overrides,
  };
}

test("renders closed at 44px with an 8px radius, a 2px line border and 12px padding", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Estado/ }).element() as HTMLElement;
  const style = getComputedStyle(trigger);
  const rect = trigger.getBoundingClientRect();

  expect(rect.height).toBeGreaterThan(43);
  expect(rect.height).toBeLessThan(45);
  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(style.borderRadius).toBe("8px");
  expect(style.borderWidth).toBe("2px");
  expect(style.borderColor).toBe(tokenRgb("line"));
  expect(style.paddingLeft).toBe("12px");
  expect(style.paddingRight).toBe("12px");

  await expectNoAccessibilityViolations(screen.container);
});

test("shows the label in 14px secondary text and the chosen value in 16px bold ink", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Estado/ });
  const label = trigger.getByText("Estado", { exact: true }).element() as HTMLElement;
  const value = trigger.getByText("Todos", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(label).fontSize).toBe("14px");
  expect(getComputedStyle(label).color).toBe(tokenRgb("ink-secondary"));
  expect(getComputedStyle(value).fontSize).toBe("16px");
  expect(getComputedStyle(value).fontWeight).toBe("700");
  expect(getComputedStyle(value).color).toBe(tokenRgb("ink"));

  await expectNoAccessibilityViolations(screen.container);
});

test("shows a 16px down chevron in secondary text when closed", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Estado/ }).element() as HTMLElement;
  const icon = trigger.querySelector("svg") as SVGSVGElement;
  const rect = icon.getBoundingClientRect();

  expect(icon.classList.contains("lucide-chevron-down")).toBe(true);
  expect(rect.width).toBeGreaterThan(15);
  expect(rect.width).toBeLessThan(17);
  expect(getComputedStyle(icon).color).toBe(tokenRgb("ink-secondary"));

  await expectNoAccessibilityViolations(screen.container);
});

test("turns the border blue UI and the chevron up when opened", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Estado/ });

  await trigger.click();

  await expect
    .poll(() => getComputedStyle(trigger.element()).borderColor)
    .toBe(tokenRgb("brand-blue-ui"));
  await expect.element(screen.getByRole("listbox")).toBeVisible();

  const icon = trigger.element().querySelector("svg") as SVGSVGElement;
  expect(icon.classList.contains("lucide-chevron-up")).toBe(true);

  await expectNoAccessibilityViolations(document.body);
});

test("opens a menu at least 200px wide, matching the trigger, white with an 8px radius and the menu shadow", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  const trigger = screen.getByRole("button", { name: /Estado/ });

  await trigger.click();

  const listbox = screen.getByRole("listbox").element() as HTMLElement;
  const menu = listbox.parentElement as HTMLElement;
  const style = getComputedStyle(menu);
  const rect = menu.getBoundingClientRect();

  expect(rect.width).toBeGreaterThanOrEqual(200);
  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(style.borderRadius).toBe("8px");
  expect(style.borderWidth).toBe("1px");
  expect(style.borderColor).toBe(tokenRgb("line"));
  expect(style.boxShadow).toContain("8px");
  expect(style.boxShadow).toContain("24px");
  expect(style.boxShadow).toContain(tokenBackgroundColor("ink-menu-shadow"));

  await expectNoAccessibilityViolations(document.body);
});

test("keeps the menu at the 200px floor when the trigger is narrower than that", async () => {
  const narrowOptions: [ListFilterOption<"a" | "b">, ListFilterOption<"a" | "b">] = [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
  ];
  const screen = await render(
    <ListFilter label="X" options={narrowOptions} value="a" onChange={() => {}} />,
  );
  const trigger = screen.getByRole("button", { name: /X/ });

  const triggerWidth = trigger.element().getBoundingClientRect().width;
  expect(triggerWidth).toBeLessThan(200);

  await trigger.click();
  const menu = screen.getByRole("listbox").element().parentElement as HTMLElement;

  expect(menu.getBoundingClientRect().width).toBeCloseTo(200, 0);

  await expectNoAccessibilityViolations(document.body);
});

test("matches the menu to a trigger wider than 200px", async () => {
  const wideOptions: [ListFilterOption<"a" | "b">, ListFilterOption<"a" | "b">] = [
    { value: "a", label: "A very long chosen option value" },
    { value: "b", label: "Another very long chosen option value" },
  ];
  const screen = await render(
    <ListFilter
      label="A rather long filter label"
      options={wideOptions}
      value="a"
      onChange={() => {}}
    />,
  );
  const trigger = screen.getByRole("button", { name: /A rather long filter label/ });

  const triggerWidth = trigger.element().getBoundingClientRect().width;
  expect(triggerWidth).toBeGreaterThan(200);

  await trigger.click();
  const menu = screen.getByRole("listbox").element().parentElement as HTMLElement;

  expect(menu.getBoundingClientRect().width).toBeCloseTo(triggerWidth, 0);

  await expectNoAccessibilityViolations(document.body);
});

test("renders each option at 40px with a 6px radius and 14px semibold ink", async () => {
  const screen = await render(<ListFilter {...baseProps()} />);
  await screen.getByRole("button", { name: /Estado/ }).click();

  const option = screen.getByRole("option", { name: "Abiertas" }).element() as HTMLElement;
  const style = getComputedStyle(option);
  const rect = option.getBoundingClientRect();

  expect(rect.height).toBeGreaterThan(39);
  expect(rect.height).toBeLessThan(41);
  expect(style.borderRadius).toBe("6px");
  expect(style.fontSize).toBe("14px");
  expect(style.fontWeight).toBe("600");
  expect(style.color).toBe(tokenRgb("ink"));

  await expectNoAccessibilityViolations(document.body);
});

test("shows a 16px blue strong check on the chosen option only", async () => {
  const screen = await render(<ListFilter {...baseProps({ value: "open" })} />);
  await screen.getByRole("button", { name: /Estado/ }).click();

  const chosen = screen.getByRole("option", { name: "Abiertas" }).element() as HTMLElement;
  const unchosen = screen.getByRole("option", { name: "Todos" }).element() as HTMLElement;
  const check = chosen.querySelector("svg") as SVGSVGElement;

  expect(check).not.toBeNull();
  const rect = check.getBoundingClientRect();
  expect(rect.width).toBeGreaterThan(15);
  expect(rect.width).toBeLessThan(17);
  expect(getComputedStyle(check).color).toBe(tokenRgb("brand-blue-strong"));
  expect(unchosen.querySelector("svg")).toBeNull();

  await expectNoAccessibilityViolations(document.body);
});

test("gives the caller the chosen option and closes the menu, on click", async () => {
  const onChange = vi.fn();
  const screen = await render(<ListFilter {...baseProps({ onChange })} />);
  await screen.getByRole("button", { name: /Estado/ }).click();

  await screen.getByRole("option", { name: "Abiertas" }).click();

  expect(onChange).toHaveBeenCalledWith("open");
  await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();

  await expectNoAccessibilityViolations(document.body);
});

test("closes on Escape without changing anything", async () => {
  const onChange = vi.fn();
  const screen = await render(<ListFilter {...baseProps({ onChange })} />);
  await screen.getByRole("button", { name: /Estado/ }).click();
  await expect.element(screen.getByRole("listbox")).toBeVisible();

  await userEvent.keyboard("{Escape}");

  expect(onChange).not.toHaveBeenCalled();
  await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();

  await expectNoAccessibilityViolations(document.body);
});

test("does not accept a filter without a label, its options, a chosen value or an onChange handler", () => {
  expectTypeOf<{
    options: typeof options;
    value: Status;
    onChange: (value: Status) => void;
  }>().not.toExtend<ListFilterProps<Status>>();
  expectTypeOf<{
    label: string;
    value: Status;
    onChange: (value: Status) => void;
  }>().not.toExtend<ListFilterProps<Status>>();
  expectTypeOf<{
    label: string;
    options: typeof options;
    onChange: (value: Status) => void;
  }>().not.toExtend<ListFilterProps<Status>>();
  expectTypeOf<{
    label: string;
    options: typeof options;
    value: Status;
  }>().not.toExtend<ListFilterProps<Status>>();
});

test("does not accept an empty options list", () => {
  expectTypeOf<{
    label: string;
    options: [];
    value: Status;
    onChange: (value: Status) => void;
  }>().not.toExtend<ListFilterProps<Status>>();
});
