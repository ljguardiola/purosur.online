import { Percent, Wallet } from "lucide-react";
import { useState } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { tokenRgb } from "../test/token-colors";
import type { SegmentedControlIcon, SegmentedControlOption } from "./SegmentedControl";
import { SegmentedControl, type SegmentedControlProps } from "./SegmentedControl";

type EntryMode = "discount" | "newPrice";

const options: [SegmentedControlOption<EntryMode>, SegmentedControlOption<EntryMode>] = [
  { value: "discount", label: "Discount", icon: <Percent /> },
  { value: "newPrice", label: "New price", icon: <Wallet /> },
];

// The helper supplies every field a real caller must pass, so a test only overrides what it is
// checking.
function baseProps(
  overrides: Partial<SegmentedControlProps<EntryMode>> = {},
): SegmentedControlProps<EntryMode> {
  return {
    label: "Entry mode",
    options,
    value: "discount",
    onChange: () => {},
    ...overrides,
  };
}

type Screen = Awaited<ReturnType<typeof render>>;

// Mirrors OptionCardGroup.test.tsx's radioInput/radioCard split: the accessible "radio" role
// resolves to react-aria's visually hidden native <input>, while the visible option and its
// hover/pointer target both live on the <label> that wraps it.
function segmentInput(screen: Screen, label: string): HTMLInputElement {
  return screen.getByRole("radio", { name: label }).element() as HTMLInputElement;
}

function segmentOption(screen: Screen, label: string): HTMLElement {
  return segmentInput(screen, label).closest("label") as HTMLElement;
}

function segmentContainer(screen: Screen, groupLabel: string): HTMLElement {
  return screen.getByRole("radiogroup", { name: groupLabel }).element() as HTMLElement;
}

// An option renders two copies of its label stacked in the same grid cell (see
// SegmentedControl.tsx's ReservedWidthLabel), so a plain text query resolves to both. Style and
// interaction assertions go through this helper instead, which picks the one copy that isn't
// `invisible` — the one a sighted user actually sees.
function segmentLabelText(screen: Screen, label: string): HTMLElement {
  const candidates = [...segmentOption(screen, label).querySelectorAll("span")].filter(
    (span) => span.textContent === label && getComputedStyle(span).visibility !== "hidden",
  );
  return candidates[0] as HTMLElement;
}

test("renders the container with a 1px line border, 8px radius, 4px padding and 4px option gap", async () => {
  const screen = await render(<SegmentedControl {...baseProps()} />);
  const container = screen.getByRole("radiogroup", { name: "Entry mode" }).element() as HTMLElement;
  const style = getComputedStyle(container);

  expect(style.borderWidth).toBe("1px");
  expect(style.borderColor).toBe(tokenRgb("line"));
  expect(style.borderRadius).toBe("8px");
  expect(style.paddingTop).toBe("4px");
  expect(style.paddingLeft).toBe("4px");
  expect(style.columnGap).toBe("4px");

  await expectNoAccessibilityViolations(screen.container);
});

test("renders each option's label, and its icon when given one", async () => {
  const screen = await render(<SegmentedControl {...baseProps()} />);

  for (const option of options) {
    expect(segmentLabelText(screen, option.label)).not.toBeUndefined();
    expect(segmentOption(screen, option.label).querySelector("svg")).not.toBeNull();
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("renders an option with no icon", async () => {
  const noIconOptions: [SegmentedControlOption<EntryMode>, SegmentedControlOption<EntryMode>] = [
    { value: "discount", label: "Discount" },
    { value: "newPrice", label: "New price" },
  ];
  const screen = await render(<SegmentedControl {...baseProps({ options: noIconOptions })} />);

  expect(segmentOption(screen, "Discount").querySelector("svg")).toBeNull();
  await expectNoAccessibilityViolations(screen.container);
});

test("gives every option a 6px radius and 16px horizontal padding, with a 16px label", async () => {
  const screen = await render(<SegmentedControl {...baseProps()} />);
  const option = segmentOption(screen, "Discount");
  const style = getComputedStyle(option);
  const label = segmentLabelText(screen, "Discount");

  expect(style.borderRadius).toBe("6px");
  expect(style.paddingLeft).toBe("16px");
  expect(style.paddingRight).toBe("16px");
  expect(getComputedStyle(label).fontSize).toBe("16px");

  await expectNoAccessibilityViolations(screen.container);
});

test("renders the large size with a 56px container whose options fill its inner height, and an 18px icon with an 8px icon-to-label gap", async () => {
  const screen = await render(<SegmentedControl {...baseProps({ size: "large" })} />);
  const container = segmentContainer(screen, "Entry mode");
  const option = segmentOption(screen, "Discount");
  const icon = option.querySelector("svg") as SVGSVGElement;

  expect(getComputedStyle(container).height).toBe("56px");
  expect(getComputedStyle(option).columnGap).toBe("8px");

  // The container's border-box height (56px) includes its own 1px border and 4px padding on
  // each side, so an option filling the inner height stretches to 56 - 2*1 - 2*4 = 46px.
  const optionRect = option.getBoundingClientRect();
  expect(optionRect.height).toBeCloseTo(46, 0);

  const iconRect = icon.getBoundingClientRect();
  expect(iconRect.width).toBeGreaterThan(17);
  expect(iconRect.width).toBeLessThan(19);

  await expectNoAccessibilityViolations(screen.container);
});

test("renders the medium size with a 48px container whose options fill its inner height, and a 16px icon with a 6px icon-to-label gap", async () => {
  const screen = await render(<SegmentedControl {...baseProps({ size: "medium" })} />);
  const container = segmentContainer(screen, "Entry mode");
  const option = segmentOption(screen, "Discount");
  const icon = option.querySelector("svg") as SVGSVGElement;

  expect(getComputedStyle(container).height).toBe("48px");
  expect(getComputedStyle(option).columnGap).toBe("6px");

  // See the large-size test above: 48 - 2*1 border - 2*4 padding = 38px.
  const optionRect = option.getBoundingClientRect();
  expect(optionRect.height).toBeCloseTo(38, 0);

  const iconRect = icon.getBoundingClientRect();
  expect(iconRect.width).toBeGreaterThan(15);
  expect(iconRect.width).toBeLessThan(17);

  await expectNoAccessibilityViolations(screen.container);
});

test("defaults to the medium size when none is given", async () => {
  const screen = await render(<SegmentedControl {...baseProps()} />);
  const container = segmentContainer(screen, "Entry mode");

  expect(getComputedStyle(container).height).toBe("48px");
  await expectNoAccessibilityViolations(screen.container);
});

test("colors a not-chosen option with no background, a regular ink label and a secondary icon", async () => {
  const screen = await render(<SegmentedControl {...baseProps({ value: "newPrice" })} />);
  const option = segmentOption(screen, "Discount");
  const icon = option.querySelector("svg") as SVGSVGElement;
  const label = segmentLabelText(screen, "Discount");

  expect(getComputedStyle(option).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(getComputedStyle(label).fontWeight).toBe("400");
  expect(getComputedStyle(label).color).toBe(tokenRgb("ink"));
  expect(getComputedStyle(icon).color).toBe(tokenRgb("ink-secondary"));

  await expectNoAccessibilityViolations(screen.container);
});

test("turns a hovered not-chosen option's background bone without changing its other colors", async () => {
  const screen = await render(<SegmentedControl {...baseProps({ value: "newPrice" })} />);
  const option = segmentOption(screen, "Discount");
  const label = segmentLabelText(screen, "Discount");

  await userEvent.hover(option);
  await expect.poll(() => getComputedStyle(option).backgroundColor).toBe(tokenRgb("surface-bone"));

  expect(getComputedStyle(label).fontWeight).toBe("400");
  await expectNoAccessibilityViolations(screen.container);
});

test("colors the chosen option with the blue message background, a bold blue strong label and icon", async () => {
  const screen = await render(<SegmentedControl {...baseProps({ value: "discount" })} />);
  const option = segmentOption(screen, "Discount");
  const icon = option.querySelector("svg") as SVGSVGElement;
  const label = segmentLabelText(screen, "Discount");

  expect(getComputedStyle(option).backgroundColor).toBe(tokenRgb("brand-blue-message-bg"));
  expect(getComputedStyle(label).fontWeight).toBe("700");
  expect(getComputedStyle(label).color).toBe(tokenRgb("brand-blue-strong"));
  expect(getComputedStyle(icon).color).toBe(tokenRgb("brand-blue-strong"));

  await expectNoAccessibilityViolations(screen.container);
});

test("does not change the chosen option's background on hover", async () => {
  const screen = await render(<SegmentedControl {...baseProps({ value: "discount" })} />);
  const option = segmentOption(screen, "Discount");

  await userEvent.hover(option);
  await expect.poll(() => option.hasAttribute("data-hovered")).toBe(true);

  expect(getComputedStyle(option).backgroundColor).toBe(tokenRgb("brand-blue-message-bg"));
  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the control's width stable when the chosen option changes", async () => {
  function Harness() {
    const [value, setValue] = useState<EntryMode>("discount");
    return <SegmentedControl {...baseProps({ value, onChange: setValue })} />;
  }

  const screen = await render(<Harness />);
  const container = screen.getByRole("radiogroup", { name: "Entry mode" }).element() as HTMLElement;
  const widthBefore = container.getBoundingClientRect().width;

  await userEvent.click(segmentOption(screen, "New price"));
  await expect.poll(() => segmentInput(screen, "New price").checked).toBe(true);

  const widthAfter = container.getBoundingClientRect().width;
  expect(widthAfter).toBeCloseTo(widthBefore, 0);

  await expectNoAccessibilityViolations(screen.container);
});

test("chooses an option with a click, unchoosing the previous one", async () => {
  function Harness() {
    const [value, setValue] = useState<EntryMode>("discount");
    return <SegmentedControl {...baseProps({ value, onChange: setValue })} />;
  }

  const screen = await render(<Harness />);

  await userEvent.click(segmentOption(screen, "New price"));

  expect(segmentInput(screen, "New price").checked).toBe(true);
  expect(segmentInput(screen, "Discount").checked).toBe(false);

  await expectNoAccessibilityViolations(screen.container);
});

test("clicking the already-chosen option changes nothing", async () => {
  const onChange = vi.fn();
  const screen = await render(<SegmentedControl {...baseProps({ value: "discount", onChange })} />);

  await userEvent.click(segmentOption(screen, "Discount"));

  expect(onChange).not.toHaveBeenCalled();
  expect(segmentInput(screen, "Discount").checked).toBe(true);

  await expectNoAccessibilityViolations(screen.container);
});

test("is a single tab stop landing on the chosen option", async () => {
  const screen = await render(
    <>
      <button type="button">Before</button>
      <SegmentedControl {...baseProps({ value: "newPrice" })} />
      <button type="button">After</button>
    </>,
  );

  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Before" }).element());

  await userEvent.tab();
  expect(document.activeElement).toBe(segmentInput(screen, "New price"));

  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "After" }).element());

  await expectNoAccessibilityViolations(screen.container);
});

test("moves focus and choice with the arrow keys", async () => {
  function Harness() {
    const [value, setValue] = useState<EntryMode>("discount");
    return <SegmentedControl {...baseProps({ value, onChange: setValue })} />;
  }

  const screen = await render(<Harness />);

  await userEvent.tab();
  expect(document.activeElement).toBe(segmentInput(screen, "Discount"));

  await userEvent.keyboard("{ArrowRight}");

  expect(document.activeElement).toBe(segmentInput(screen, "New price"));
  expect(segmentInput(screen, "New price").checked).toBe(true);

  await expectNoAccessibilityViolations(screen.container);
});

test("shows the package's focus ring on the focused option", async () => {
  const screen = await render(<SegmentedControl {...baseProps()} />);
  const option = segmentOption(screen, "Discount");

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(option).outlineWidth).toBe("3px");
  await expect.poll(() => getComputedStyle(option).outlineOffset).toBe("3px");
  await expect
    .poll(() => getComputedStyle(option).outlineColor)
    .toBe(tokenRgb("brand-blue-strong"));

  await expectNoAccessibilityViolations(screen.container);
});

test("exposes the group as a radiogroup named by the caller's label", async () => {
  const screen = await render(<SegmentedControl {...baseProps({ label: "Entry mode" })} />);

  await expect.element(screen.getByRole("radiogroup", { name: "Entry mode" })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("exposes each option as a radio button named by its label and its chosen state", async () => {
  const screen = await render(<SegmentedControl {...baseProps({ value: "newPrice" })} />);

  await expect.element(screen.getByRole("radio", { name: "Discount" })).not.toBeChecked();
  await expect.element(screen.getByRole("radio", { name: "New price" })).toBeChecked();

  await expectNoAccessibilityViolations(screen.container);
});

// See Button.test.tsx and OptionCardGroup.test.tsx for the same "does not compile" pattern: the
// caller's input is checked at the type level, not just at runtime.
test("does not accept an option without a value or a label", () => {
  expectTypeOf<{
    label: string;
    icon: SegmentedControlIcon;
  }>().not.toExtend<SegmentedControlOption>();
  expectTypeOf<{
    value: string;
    icon: SegmentedControlIcon;
  }>().not.toExtend<SegmentedControlOption>();
});

test("accepts an option with no icon", () => {
  expectTypeOf<{ value: string; label: string }>().toExtend<SegmentedControlOption>();
});

test("does not accept a group without a label, a chosen value or an onChange handler", () => {
  expectTypeOf<{
    options: typeof options;
    value: EntryMode;
    onChange: (value: EntryMode) => void;
  }>().not.toExtend<SegmentedControlProps<EntryMode>>();
  expectTypeOf<{
    label: string;
    options: typeof options;
    onChange: (value: EntryMode) => void;
  }>().not.toExtend<SegmentedControlProps<EntryMode>>();
  expectTypeOf<{
    label: string;
    options: typeof options;
    value: EntryMode;
  }>().not.toExtend<SegmentedControlProps<EntryMode>>();
});

// "Exactly one option is always chosen" is enforced at the type level, not just at runtime:
// `value` is pinned to the union of the group's own option values (inferred from `options`), and
// `options` is a non-empty tuple, so neither a value outside the group nor an empty group compiles.
test("does not accept a chosen value outside the group's own options, or an empty options list", () => {
  expectTypeOf<{
    label: string;
    options: typeof options;
    value: "other";
    onChange: (value: EntryMode) => void;
  }>().not.toExtend<SegmentedControlProps<EntryMode>>();

  expectTypeOf<{
    label: string;
    options: [];
    value: EntryMode;
    onChange: (value: EntryMode) => void;
  }>().not.toExtend<SegmentedControlProps<EntryMode>>();
});

// Proves the NoInfer fix at a real call site with no explicit type argument, the way JSX actually
// invokes the component. See OptionCardGroup.test.tsx's isValidOptionCardGroupCall for the full
// rationale behind this overload-based check.
type SegmentedControlValueOnlyProps<V extends string> = {
  options: readonly [
    Pick<SegmentedControlOption<V>, "value">,
    ...Pick<SegmentedControlOption<V>, "value">[],
  ];
  value: SegmentedControlProps<V>["value"];
  onChange: SegmentedControlProps<V>["onChange"];
};

function isValidSegmentedControlCall<V extends string>(
  props: SegmentedControlValueOnlyProps<V>,
): true;
function isValidSegmentedControlCall(props: unknown): false;
function isValidSegmentedControlCall(_props: unknown): boolean {
  return true;
}

test("cannot widen V through `value` at a real call site with no explicit type argument", () => {
  const validCall = isValidSegmentedControlCall({
    options: [{ value: "discount" }, { value: "newPrice" }],
    value: "discount",
    onChange: () => {},
  });
  expectTypeOf(validCall).toEqualTypeOf<true>();

  const invalidCall = isValidSegmentedControlCall({
    options: [{ value: "discount" }, { value: "newPrice" }],
    value: "other",
    onChange: () => {},
  });
  expectTypeOf(invalidCall).toEqualTypeOf<false>();
});
