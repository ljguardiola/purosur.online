import { useId, useState } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { insetBoundary, tokenRgb } from "../../test/token-colors";
import type { FieldErrorProps } from "./field-error";
import { Select } from "./select";
import { ToggleChipGroup, type ToggleChipGroupProps } from "./toggle-chip-group";

type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const options: ToggleChipGroupProps<Day>["options"] = [
  { value: "mon", label: "Mon", accessibleName: "Monday" },
  { value: "tue", label: "Tue", accessibleName: "Tuesday" },
  { value: "wed", label: "Wed", accessibleName: "Wednesday" },
  { value: "thu", label: "Thu", accessibleName: "Thursday" },
  { value: "fri", label: "Fri", accessibleName: "Friday" },
  { value: "sat", label: "Sat", accessibleName: "Saturday" },
  { value: "sun", label: "Sun", accessibleName: "Sunday" },
];

type BaseProps = Omit<ToggleChipGroupProps<Day>, keyof FieldErrorProps>;

function baseProps(overrides: Partial<BaseProps> = {}): BaseProps {
  return { label: "Days", options, value: [], onChange: () => {}, ...overrides };
}

function ControlledGroup({ initial, onChange }: { initial: Day[]; onChange?: (v: Day[]) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <ToggleChipGroup
      {...baseProps({
        value,
        onChange: (next) => {
          setValue(next);
          onChange?.(next);
        },
      })}
    />
  );
}

type Screen = Awaited<ReturnType<typeof render>>;

function chip(screen: Screen, name: string): HTMLElement {
  return screen.getByRole("button", { name }).element() as HTMLElement;
}

test("shows the visible label and names the group after it", async () => {
  const screen = await render(<ToggleChipGroup {...baseProps()} />);

  await expect.element(screen.getByText("Days", { exact: true })).toBeVisible();
  await expect.element(screen.getByRole("toolbar", { name: "Days" })).toBeVisible();
});

test("shows every option's visible label as a chip named by its accessible name", async () => {
  const screen = await render(<ToggleChipGroup {...baseProps()} />);

  for (const option of options) {
    const element = chip(screen, option.accessibleName ?? option.label);
    expect(element.textContent).toBe(option.label);
  }
});

test("names a chip by its label when the option has no accessible name", async () => {
  const screen = await render(
    <ToggleChipGroup {...baseProps({ options: [{ value: "mon", label: "Monday" }] })} />,
  );

  await expect.element(screen.getByRole("button", { name: "Monday" })).toBeVisible();
});

test("marks exactly the chosen chips as pressed", async () => {
  const screen = await render(<ToggleChipGroup {...baseProps({ value: ["tue", "sun"] })} />);

  expect(chip(screen, "Tuesday").getAttribute("aria-pressed")).toBe("true");
  expect(chip(screen, "Sunday").getAttribute("aria-pressed")).toBe("true");
  expect(chip(screen, "Monday").getAttribute("aria-pressed")).toBe("false");
});

test("reports the new set in option order when a chip is chosen", async () => {
  const onChange = vi.fn();
  const screen = await render(<ControlledGroup initial={["fri"]} onChange={onChange} />);

  await userEvent.click(chip(screen, "Tuesday"));

  expect(onChange).toHaveBeenLastCalledWith(["tue", "fri"]);
  expect(chip(screen, "Tuesday").getAttribute("aria-pressed")).toBe("true");
});

test("reports the set without a chip when it is unchosen, down to none", async () => {
  const onChange = vi.fn();
  const screen = await render(<ControlledGroup initial={["mon", "tue"]} onChange={onChange} />);

  await userEvent.click(chip(screen, "Monday"));
  expect(onChange).toHaveBeenLastCalledWith(["tue"]);

  await userEvent.click(chip(screen, "Tuesday"));
  expect(onChange).toHaveBeenLastCalledWith([]);
});

test("toggles the focused chip with Space and Enter and moves between chips with the arrow keys", async () => {
  const onChange = vi.fn();
  const screen = await render(<ControlledGroup initial={[]} onChange={onChange} />);

  await userEvent.tab();
  expect(document.activeElement).toBe(chip(screen, "Monday"));
  await userEvent.keyboard(" ");
  expect(onChange).toHaveBeenLastCalledWith(["mon"]);

  await userEvent.keyboard("{ArrowRight}");
  expect(document.activeElement).toBe(chip(screen, "Tuesday"));
  await userEvent.keyboard("{Enter}");
  expect(onChange).toHaveBeenLastCalledWith(["mon", "tue"]);
});

test("is a single tab stop", async () => {
  await render(
    <>
      <button type="button">Before</button>
      <ToggleChipGroup {...baseProps()} />
      <button type="button">After</button>
    </>,
  );

  await userEvent.tab();
  await userEvent.tab();
  await userEvent.tab();
  expect(document.activeElement?.textContent).toBe("After");
});

test("lays the chips out as one row of equally wide chips 8px apart", async () => {
  const screen = await render(<ToggleChipGroup {...baseProps()} />);
  const rects = options.map((option) =>
    chip(screen, option.accessibleName ?? option.label).getBoundingClientRect(),
  );

  for (const rect of rects) {
    expect(rect.width).toBeCloseTo(rects[0]?.width ?? 0, 0);
    expect(rect.top).toBe(rects[0]?.top);
  }
  for (const [index, rect] of rects.slice(1).entries()) {
    expect(rect.left - (rects[index]?.right ?? 0)).toBeCloseTo(8, 0);
  }
});

test("matches a select beside it in label, label spacing and height", async () => {
  const screen = await render(
    <>
      <Select
        name="role"
        label="Kind"
        options={[{ value: "a", label: "A" }]}
        value="a"
        onChange={() => {}}
      />
      <ToggleChipGroup {...baseProps()} />
    </>,
  );
  const selectLabel = screen.getByText("Kind", { exact: true }).element();
  const groupLabel = screen.getByText("Days", { exact: true }).element();
  const selectTrigger = screen.getByRole("button", { name: /Kind/ }).element();
  const selectField = selectLabel.parentElement as HTMLElement;
  const groupField = groupLabel.parentElement as HTMLElement;

  expect(getComputedStyle(groupLabel).font).toBe(getComputedStyle(selectLabel).font);
  expect(getComputedStyle(groupField).rowGap).toBe(getComputedStyle(selectField).rowGap);
  expect(chip(screen, "Monday").getBoundingClientRect().height).toBe(
    selectTrigger.getBoundingClientRect().height,
  );
});

test("draws a chosen chip blue with a 2px blue border and white bold 14px text, 8px rounded", async () => {
  const screen = await render(<ToggleChipGroup {...baseProps({ value: ["mon"] })} />);
  const style = getComputedStyle(chip(screen, "Monday"));

  expect(style.backgroundColor).toBe(tokenRgb("action"));
  expect(style.boxShadow).toContain(insetBoundary("action", "2px"));
  expect(style.color).toBe(tokenRgb("text-inverse"));
  expect(style.fontWeight).toBe("700");
  expect(style.fontSize).toBe("14px");
  expect(style.borderRadius).toBe("8px");
  expect(style.justifyContent).toBe("center");
});

test("draws an unchosen chip on the surface with the field border and regular ink text", async () => {
  const screen = await render(<ToggleChipGroup {...baseProps()} />);
  const style = getComputedStyle(chip(screen, "Monday"));

  expect(style.backgroundColor).toBe(tokenRgb("surface"));
  expect(style.boxShadow).toContain(insetBoundary("border", "2px"));
  expect(style.color).toBe(tokenRgb("text"));
  expect(style.fontWeight).toBe("400");
});

test("turns a hovered unchosen chip bone and a hovered chosen chip strong blue", async () => {
  const screen = await render(<ToggleChipGroup {...baseProps({ value: ["tue"] })} />);
  const unchosen = chip(screen, "Monday");
  const chosen = chip(screen, "Tuesday");

  await userEvent.hover(unchosen);
  await expect
    .poll(() => getComputedStyle(unchosen).backgroundColor)
    .toBe(tokenRgb("surface-subtle"));

  await userEvent.hover(chosen);
  await expect.poll(() => getComputedStyle(chosen).backgroundColor).toBe(tokenRgb("action-strong"));
});

test("shows the package's focus ring on the keyboard-focused chip", async () => {
  const screen = await render(<ToggleChipGroup {...baseProps()} />);

  await userEvent.tab();

  const style = getComputedStyle(chip(screen, "Monday"));
  await expect.poll(() => getComputedStyle(chip(screen, "Monday")).outlineWidth).toBe("3px");
  expect(style.outlineColor).toBe(tokenRgb("focus"));
});

test("shows the pointer cursor on each chip", async () => {
  const screen = await render(<ToggleChipGroup {...baseProps()} />);

  expect(getComputedStyle(chip(screen, "Monday")).cursor).toBe("pointer");
});

test("disables every chip and dims the whole field", async () => {
  const screen = await render(<ToggleChipGroup {...baseProps({ disabled: true })} />);

  for (const option of options) {
    const element = chip(screen, option.accessibleName ?? option.label) as HTMLButtonElement;
    expect(element.disabled).toBe(true);
  }
  expect(getComputedStyle(screen.container.firstElementChild as Element).opacity).toBe("0.45");
});

test("shows the description under the chips and describes the group with it", async () => {
  const screen = await render(<ToggleChipGroup {...baseProps({ description: "Every day." })} />);

  await expect.element(screen.getByText("Every day.")).toBeVisible();
  await expect
    .element(screen.getByRole("toolbar", { name: "Days" }))
    .toHaveAccessibleDescription("Every day.");
});

test("shows the error message in place of the description, draws unchosen chips red and describes the group with it", async () => {
  const screen = await render(
    <ToggleChipGroup {...baseProps({ description: "Every day." })} errorMessage="Pick a day." />,
  );

  await expect.element(screen.getByText("Pick a day.")).toBeVisible();
  expect(screen.getByText("Every day.").query()).toBeNull();
  await expect
    .element(screen.getByRole("toolbar", { name: "Days" }))
    .toHaveAccessibleDescription("Pick a day.");
  expect(getComputedStyle(chip(screen, "Monday")).boxShadow).toContain(
    insetBoundary("error", "2px"),
  );
});

function GroupWithMessageElsewhere() {
  const messageId = useId();
  return (
    <>
      <ToggleChipGroup {...baseProps()} errorMessageId={messageId} />
      <p id={messageId}>Pick a day.</p>
    </>
  );
}

test("describes the group with a message rendered elsewhere", async () => {
  const screen = await render(<GroupWithMessageElsewhere />);

  await expect
    .element(screen.getByRole("toolbar", { name: "Days" }))
    .toHaveAccessibleDescription("Pick a day.");
});

test("passes the accessibility checks chosen, invalid and disabled", async () => {
  const screen = await render(
    <>
      <ToggleChipGroup {...baseProps({ value: ["mon", "sun"], description: "Help." })} />
      <ToggleChipGroup {...baseProps({ label: "Other days" })} errorMessage="Pick a day." />
      <ToggleChipGroup {...baseProps({ label: "Off days", disabled: true })} />
    </>,
  );

  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a group without a label, a value or an onChange handler, or with no options", () => {
  expectTypeOf<Omit<ToggleChipGroupProps<Day>, "label">>().not.toExtend<
    ToggleChipGroupProps<Day>
  >();
  expectTypeOf<Omit<ToggleChipGroupProps<Day>, "value">>().not.toExtend<
    ToggleChipGroupProps<Day>
  >();
  expectTypeOf<Omit<ToggleChipGroupProps<Day>, "onChange">>().not.toExtend<
    ToggleChipGroupProps<Day>
  >();
  expectTypeOf<{ label: string; options: []; value: Day[]; onChange: () => void }>().not.toExtend<
    ToggleChipGroupProps<Day>
  >();
});
