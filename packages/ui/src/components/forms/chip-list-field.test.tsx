import { useState } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { AA_TEXT_CONTRAST, contrastRatio } from "../../styles/contrast";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { expectFullyRound } from "../../test/fully-round";
import { rgbToHex, tokenRgb } from "../../test/token-colors";
import { ChipListField, type ChipListFieldProps } from "./chip-list-field";
import type { FieldErrorProps } from "./field-error";
import type { NarrowedOption } from "./option";

type Diet = "organic" | "vegan" | "local" | "dye-free";

const options: NarrowedOption<Diet, never, "status">[] = [
  { value: "organic", label: "Orgánico" },
  { value: "vegan", label: "Vegano" },
  { value: "local", label: "Local" },
  { value: "dye-free", label: "Sin colorantes", status: "Dado de baja" },
];

type BaseProps = Omit<ChipListFieldProps<Diet>, keyof FieldErrorProps>;

function baseProps(overrides: Partial<BaseProps> = {}): BaseProps {
  return {
    label: "Distintivos",
    options,
    value: [],
    onChange: () => {},
    addLabel: "Agregar distintivo",
    ...overrides,
  };
}

function ControlledField({ initial }: { initial: Diet[] }) {
  const [value, setValue] = useState(initial);
  return <ChipListField {...baseProps({ value, onChange: setValue })} />;
}

test("names the group after its label", async () => {
  const screen = await render(<ChipListField {...baseProps()} />);

  await expect.element(screen.getByRole("group", { name: "Distintivos" })).toBeVisible();
});

test("with nothing chosen, shows only the add pill", async () => {
  const screen = await render(<ChipListField {...baseProps()} />);

  const buttons = screen.getByRole("button").elements();
  expect(buttons.map((el) => el.textContent)).toEqual(["Agregar distintivo"]);
  expect(screen.container.querySelectorAll("li")).toHaveLength(1);
});

test("shows the chosen items in the order they were chosen, each with a remove button named after it", async () => {
  const screen = await render(<ChipListField {...baseProps({ value: ["local", "organic"] })} />);

  const chips = [...screen.container.querySelectorAll("li")].map((el) => el.textContent);
  expect(chips).toEqual(["Local", "Orgánico", "Agregar distintivo"]);
  await expect.element(screen.getByRole("button", { name: "Quitar Local" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Quitar Orgánico" })).toBeVisible();
});

test("draws an active chip as a fully round pill in the info tone, clearing AA text contrast", async () => {
  const screen = await render(<ChipListField {...baseProps({ value: ["local"] })} />);
  const chip = screen.container.querySelector("li") as HTMLElement;
  const style = getComputedStyle(chip);

  expect(style.backgroundColor).toBe(tokenRgb("info-subtle"));
  expect(style.color).toBe(tokenRgb("info-strong"));
  expect(style.fontWeight).toBe("600");
  expectFullyRound(chip);
  expect(
    contrastRatio(rgbToHex(style.color), rgbToHex(style.backgroundColor)),
  ).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
});

test("draws an item with a status in the neutral tone behind a dot, and names the status for assistive technology", async () => {
  const screen = await render(<ChipListField {...baseProps({ value: ["dye-free"] })} />);
  const chip = screen.container.querySelector("li") as HTMLElement;
  const style = getComputedStyle(chip);
  const dot = chip.querySelector("[aria-hidden='true']") as HTMLElement;

  expect(style.backgroundColor).toBe(tokenRgb("surface-subtle"));
  expect(style.color).toBe(tokenRgb("text-subtle"));
  expect(getComputedStyle(dot).backgroundColor).toBe(tokenRgb("neutral"));
  expect(
    contrastRatio(rgbToHex(style.color), rgbToHex(style.backgroundColor)),
  ).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
  await expect.element(screen.getByText("Dado de baja")).toBeInTheDocument();
  await expect.element(screen.getByRole("button", { name: "Quitar Sin colorantes" })).toBeVisible();
});

test("draws no dot on an active chip", async () => {
  const screen = await render(<ChipListField {...baseProps({ value: ["local"] })} />);
  const chip = screen.container.querySelector("li") as HTMLElement;

  expect(chip.querySelector(":scope > [aria-hidden='true']")).toBeNull();
});

test("draws the add pill round and outlined in the action color with no fill, with a plus icon", async () => {
  const screen = await render(<ChipListField {...baseProps()} />);
  const pill = screen.getByRole("button", { name: "Agregar distintivo" }).element() as HTMLElement;
  const style = getComputedStyle(pill);

  expectFullyRound(pill);
  expect(style.borderTopColor).toBe(tokenRgb("action"));
  expect(Number.parseFloat(style.borderTopWidth)).toBeGreaterThan(0);
  expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(pill.querySelector("svg")).not.toBeNull();
  expect(getComputedStyle(pill).cursor).toBe("pointer");
});

test("wraps chips onto further lines when they do not fit", async () => {
  const screen = await render(
    <div style={{ width: "14rem" }}>
      <ChipListField {...baseProps({ value: ["organic", "vegan", "local"] })} />
    </div>,
  );

  const tops = [...screen.container.querySelectorAll("li")].map(
    (el) => el.getBoundingClientRect().top,
  );
  expect(new Set(tops).size).toBeGreaterThan(1);
});

test("removes an item, keeping the others in order", async () => {
  const onChange = vi.fn();
  const screen = await render(
    <ChipListField {...baseProps({ value: ["organic", "vegan", "local"], onChange })} />,
  );

  await screen.getByRole("button", { name: "Quitar Vegano" }).click();

  expect(onChange).toHaveBeenCalledWith(["organic", "local"]);
});

test("removes an item from the keyboard", async () => {
  const onChange = vi.fn();
  await render(<ChipListField {...baseProps({ value: ["organic"], onChange })} />);

  await userEvent.tab();
  await userEvent.keyboard("{Enter}");

  expect(onChange).toHaveBeenCalledWith([]);
});

test("moves focus to the next chip's remove button after a removal", async () => {
  const screen = await render(<ControlledField initial={["organic", "vegan", "local"]} />);
  await screen.getByRole("button", { name: "Quitar Orgánico" }).click();

  await expect
    .poll(() => document.activeElement)
    .toBe(screen.getByRole("button", { name: "Quitar Vegano" }).element());
});

test("moves focus to the add pill after removing the last chip", async () => {
  const screen = await render(<ControlledField initial={["organic", "vegan"]} />);
  await screen.getByRole("button", { name: "Quitar Vegano" }).click();

  await expect
    .poll(() => document.activeElement)
    .toBe(screen.getByRole("button", { name: "Agregar distintivo" }).element());
});

test("moves focus to the add pill after removing the only chip, even when it was the last thing to offer", async () => {
  const single: NarrowedOption<Diet>[] = [{ value: "organic", label: "Orgánico" }];
  function Field() {
    const [value, setValue] = useState<Diet[]>(["organic"]);
    return <ChipListField {...baseProps({ options: single, value, onChange: setValue })} />;
  }
  const screen = await render(<Field />);
  await screen.getByRole("button", { name: "Quitar Orgánico" }).click();

  await expect
    .poll(() => document.activeElement)
    .toBe(screen.getByRole("button", { name: "Agregar distintivo" }).element());
});

test("moves focus to the previous chip's remove button after removing the last chip, when nothing is left to add", async () => {
  const kept: NarrowedOption<Diet, never, "status">[] = [
    { value: "organic", label: "Orgánico" },
    { value: "dye-free", label: "Sin colorantes", status: "Dado de baja" },
  ];
  function Field() {
    const [value, setValue] = useState<Diet[]>(["organic", "dye-free"]);
    return <ChipListField {...baseProps({ options: kept, value, onChange: setValue })} />;
  }
  const screen = await render(<Field />);
  await screen.getByRole("button", { name: "Quitar Sin colorantes" }).click();

  await expect.element(screen.getByRole("button", { name: "Agregar distintivo" })).toBeDisabled();
  await expect
    .poll(() => document.activeElement)
    .toBe(screen.getByRole("button", { name: "Quitar Orgánico" }).element());
});

test("keeps focus on the field after removing the only chip, when nothing is left to add", async () => {
  const onlyInactive: NarrowedOption<Diet, never, "status">[] = [
    { value: "dye-free", label: "Sin colorantes", status: "Dado de baja" },
  ];
  function Field() {
    const [value, setValue] = useState<Diet[]>(["dye-free"]);
    return <ChipListField {...baseProps({ options: onlyInactive, value, onChange: setValue })} />;
  }
  const screen = await render(<Field />);
  await screen.getByRole("button", { name: "Quitar Sin colorantes" }).click();

  await expect.element(screen.getByRole("button", { name: "Agregar distintivo" })).toBeDisabled();
  await expect
    .poll(() => document.activeElement)
    .toBe(screen.getByRole("group", { name: "Distintivos" }).element());
});

test("offers, in the order given, only the options not yet chosen and without a status", async () => {
  const screen = await render(<ChipListField {...baseProps({ value: ["vegan"] })} />);

  await screen.getByRole("button", { name: "Agregar distintivo" }).click();

  const items = screen.getByRole("menuitem").elements();
  expect(items.map((el) => el.textContent)).toEqual(["Orgánico", "Local"]);
});

test("appends the chosen option to the value and closes the menu", async () => {
  const onChange = vi.fn();
  const screen = await render(<ChipListField {...baseProps({ value: ["local"], onChange })} />);

  await screen.getByRole("button", { name: "Agregar distintivo" }).click();
  await screen.getByRole("menuitem", { name: "Orgánico" }).click();

  expect(onChange).toHaveBeenCalledWith(["local", "organic"]);
  await expect.element(screen.getByRole("menu")).not.toBeInTheDocument();
  await expect
    .poll(() => document.activeElement)
    .toBe(screen.getByRole("button", { name: "Agregar distintivo" }).element());
});

test("adds an option from the keyboard", async () => {
  const onChange = vi.fn();
  await render(<ChipListField {...baseProps({ onChange })} />);

  await userEvent.tab();
  await userEvent.keyboard("{Enter}");
  await userEvent.keyboard("{ArrowDown}{Enter}");

  expect(onChange).toHaveBeenCalledWith(["vegan"]);
});

test("ends the menu with the create entry, which reports to the caller without changing the value", async () => {
  const onChange = vi.fn();
  const onAction = vi.fn();
  const screen = await render(
    <ChipListField
      {...baseProps({ onChange, create: { label: "Crear distintivo…", onAction } })}
    />,
  );

  await screen.getByRole("button", { name: "Agregar distintivo" }).click();
  const items = screen.getByRole("menuitem").elements();
  expect(items.map((el) => el.textContent)).toEqual([
    "Orgánico",
    "Vegano",
    "Local",
    "Crear distintivo…",
  ]);
  await screen.getByRole("menuitem", { name: "Crear distintivo…" }).click();

  expect(onAction).toHaveBeenCalledOnce();
  expect(onChange).not.toHaveBeenCalled();
});

test("with every offered option chosen, the menu holds only the create entry", async () => {
  const screen = await render(
    <ChipListField
      {...baseProps({
        value: ["organic", "vegan", "local"],
        create: { label: "Crear distintivo…", onAction: () => {} },
      })}
    />,
  );

  await screen.getByRole("button", { name: "Agregar distintivo" }).click();

  expect(
    screen
      .getByRole("menuitem")
      .elements()
      .map((el) => el.textContent),
  ).toEqual(["Crear distintivo…"]);
});

test("disables the add pill when there is nothing to add and nothing to create", async () => {
  const screen = await render(
    <ChipListField {...baseProps({ value: ["organic", "vegan", "local"] })} />,
  );

  await expect.element(screen.getByRole("button", { name: "Agregar distintivo" })).toBeDisabled();
});

test("disables the add pill and every remove button when the field is disabled", async () => {
  const screen = await render(
    <ChipListField {...baseProps({ value: ["organic"], disabled: true })} />,
  );

  await expect.element(screen.getByRole("button", { name: "Agregar distintivo" })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Quitar Orgánico" })).toBeDisabled();
});

test("shows the description under the chips and describes the group with it", async () => {
  const screen = await render(
    <ChipListField {...baseProps({ value: ["dye-free"], description: "Está dado de baja." })} />,
  );

  const group = screen.getByRole("group", { name: "Distintivos" });
  await expect.element(group).toHaveAccessibleDescription("Está dado de baja.");
});

test("shows the error message in place of the description and describes the group with it", async () => {
  const screen = await render(
    <ChipListField {...baseProps({ description: "Ayuda." })} errorMessage="Elegí al menos uno." />,
  );

  const group = screen.getByRole("group", { name: "Distintivos" });
  await expect.element(group).toHaveAccessibleDescription("Elegí al menos uno.");
  expect(screen.container.textContent).not.toContain("Ayuda.");
});

test("marks the label as required", async () => {
  const screen = await render(<ChipListField {...baseProps({ required: true })} />);
  const label = screen.getByText("Distintivos").element() as HTMLElement;

  expect(getComputedStyle(label, "::after").content).not.toBe("none");
});

test("draws a focus ring on a focused remove button and on the focused add pill", async () => {
  const screen = await render(<ChipListField {...baseProps({ value: ["organic"] })} />);

  await userEvent.tab();
  const remove = screen.getByRole("button", { name: "Quitar Orgánico" }).element() as HTMLElement;
  expect(document.activeElement).toBe(remove);
  expect(getComputedStyle(remove).outlineStyle).not.toBe("none");

  await userEvent.tab();
  const pill = screen.getByRole("button", { name: "Agregar distintivo" }).element() as HTMLElement;
  expect(document.activeElement).toBe(pill);
  expect(getComputedStyle(pill).outlineStyle).not.toBe("none");
});

test("passes the accessibility checks with chips, an inactive chip, a description and the menu open", async () => {
  const screen = await render(
    <main>
      <ChipListField
        {...baseProps({
          value: ["organic", "dye-free"],
          description: "Está dado de baja.",
          create: { label: "Crear distintivo…", onAction: () => {} },
        })}
      />
    </main>,
  );
  await expectNoAccessibilityViolations(screen.container);

  await screen.getByRole("button", { name: "Agregar distintivo" }).click();
  await expect.element(screen.getByRole("menu")).toBeVisible();
  await expectNoAccessibilityViolations(document.body, {
    rules: { region: { enabled: false } },
  });
});

test("requires the create label and its action together", () => {
  expectTypeOf<{ label: string }>().not.toExtend<NonNullable<BaseProps["create"]>>();
  expectTypeOf<{ onAction: () => void }>().not.toExtend<NonNullable<BaseProps["create"]>>();
});

test("does not accept a value outside the options", () => {
  expectTypeOf<{ value: "unknown"[] }>().not.toExtend<Pick<BaseProps, "value">>();
});
