import { useState } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { insetBoundary, tokenRgb } from "../test/token-colors";
import type { RadioOption } from "./RadioGroup";
import { RadioGroup, type RadioGroupProps } from "./RadioGroup";

type PaymentMethod = "cash" | "card" | "transfer";

const options: [
  RadioOption<PaymentMethod>,
  RadioOption<PaymentMethod>,
  RadioOption<PaymentMethod>,
] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "transfer", label: "Transfer" },
];

// The helper supplies every field a real caller must pass, so a test only overrides what it is
// checking.
function baseProps(
  overrides: Partial<RadioGroupProps<PaymentMethod>> = {},
): RadioGroupProps<PaymentMethod> {
  return {
    label: "Payment method",
    options,
    value: "cash",
    onChange: () => {},
    ...overrides,
  };
}

type Screen = Awaited<ReturnType<typeof render>>;

// Mirrors OptionCardGroup.test.tsx's radioInput/radioCard split: the accessible "radio" role
// resolves to react-aria's visually hidden native <input>, while the visible circle and its own
// pointer target both live on the <label> that wraps it.
function radioInput(screen: Screen, name: string): HTMLInputElement {
  return screen.getByRole("radio", { name }).element() as HTMLInputElement;
}

function radioLabel(screen: Screen, name: string): HTMLElement {
  return radioInput(screen, name).closest("label") as HTMLElement;
}

// React Aria's Radio renders a visually hidden wrapper around the native <input> as the label's
// first child, our own circle as its second, and the caller's label text after that.
function radioCircle(screen: Screen, name: string): HTMLElement {
  return radioLabel(screen, name).children[1] as HTMLElement;
}

function Harness() {
  const [value, setValue] = useState<PaymentMethod>("cash");
  return <RadioGroup {...baseProps({ value, onChange: setValue })} />;
}

test("renders every option's 20px circle 12px from its label, vertically centered", async () => {
  const screen = await render(<RadioGroup {...baseProps()} />);

  for (const option of options) {
    const label = radioLabel(screen, option.label);
    const circle = radioCircle(screen, option.label);
    const circleRect = circle.getBoundingClientRect();

    expect(circleRect.width).toBeGreaterThan(19);
    expect(circleRect.width).toBeLessThan(21);
    expect(circleRect.height).toBeGreaterThan(19);
    expect(circleRect.height).toBeLessThan(21);
    expect(getComputedStyle(label).alignItems).toBe("center");

    const text = screen.getByText(option.label).element() as HTMLElement;
    const gap = text.getBoundingClientRect().left - circleRect.right;
    expect(gap).toBeGreaterThan(11);
    expect(gap).toBeLessThan(13);
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("stacks options vertically, 12px apart", async () => {
  const screen = await render(<RadioGroup {...baseProps()} />);

  const cashRect = radioLabel(screen, "Cash").getBoundingClientRect();
  const cardRect = radioLabel(screen, "Card").getBoundingClientRect();
  const transferRect = radioLabel(screen, "Transfer").getBoundingClientRect();

  expect(cardRect.left).toBeCloseTo(cashRect.left, 0);
  expect(transferRect.left).toBeCloseTo(cashRect.left, 0);

  const firstGap = cardRect.top - cashRect.bottom;
  const secondGap = transferRect.top - cardRect.bottom;
  expect(firstGap).toBeGreaterThan(11);
  expect(firstGap).toBeLessThan(13);
  expect(secondGap).toBeGreaterThan(11);
  expect(secondGap).toBeLessThan(13);

  await expectNoAccessibilityViolations(screen.container);
});

test("colors an unchecked circle white with a 2px ink-secondary border", async () => {
  const screen = await render(<RadioGroup {...baseProps({ value: "card" })} />);
  const circle = radioCircle(screen, "Cash");
  const style = getComputedStyle(circle);

  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(style.boxShadow).toContain(insetBoundary("ink-secondary", "2px"));

  await expectNoAccessibilityViolations(screen.container);
});

test("colors a checked circle white with a 6px blue UI ring and no separate dot", async () => {
  const screen = await render(<RadioGroup {...baseProps({ value: "cash" })} />);
  const circle = radioCircle(screen, "Cash");
  const style = getComputedStyle(circle);

  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(style.boxShadow).toContain(insetBoundary("brand-blue-ui", "6px"));
  // The 2px border becomes the ring, rather than being layered under it.
  expect(style.boxShadow).not.toContain(tokenRgb("ink-secondary"));
  expect(circle.querySelector("svg")).toBeNull();
  expect(circle.children.length).toBe(0);

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the circle's size stable between the unchecked and checked states", async () => {
  const uncheckedScreen = await render(<RadioGroup {...baseProps({ value: "card" })} />);
  const uncheckedRect = radioCircle(uncheckedScreen, "Cash").getBoundingClientRect();
  await uncheckedScreen.unmount();

  const checkedScreen = await render(<RadioGroup {...baseProps({ value: "cash" })} />);
  const checkedRect = radioCircle(checkedScreen, "Cash").getBoundingClientRect();

  expect(checkedRect.width).toBeCloseTo(uncheckedRect.width, 0);
  expect(checkedRect.height).toBeCloseTo(uncheckedRect.height, 0);

  await expectNoAccessibilityViolations(checkedScreen.container);
});

test("turns a hovered unchecked circle's fill bone, keeping its 2px ink-secondary boundary", async () => {
  const screen = await render(<RadioGroup {...baseProps({ value: "cash" })} />);
  const uncheckedLabel = radioLabel(screen, "Card");
  const uncheckedCircle = radioCircle(screen, "Card");

  await userEvent.hover(uncheckedLabel);
  await expect
    .poll(() => getComputedStyle(uncheckedCircle).backgroundColor)
    .toBe(tokenRgb("surface-bone"));
  expect(getComputedStyle(uncheckedCircle).boxShadow).toContain(
    insetBoundary("ink-secondary", "2px"),
  );

  await expectNoAccessibilityViolations(screen.container);
});

test("darkens a hovered checked circle's ring while keeping its white fill", async () => {
  const screen = await render(<RadioGroup {...baseProps({ value: "cash" })} />);
  const checkedLabel = radioLabel(screen, "Cash");
  const checkedCircle = radioCircle(screen, "Cash");

  await userEvent.hover(checkedLabel);
  await expect
    .poll(() => getComputedStyle(checkedCircle).boxShadow)
    .toContain(insetBoundary("brand-blue-strong", "6px"));
  expect(getComputedStyle(checkedCircle).backgroundColor).toBe(tokenRgb("surface-white"));

  await expectNoAccessibilityViolations(screen.container);
});

test("chooses an option with a click, unchoosing the previous one", async () => {
  const screen = await render(<Harness />);

  await userEvent.click(radioLabel(screen, "Card"));

  expect(radioInput(screen, "Card").checked).toBe(true);
  expect(radioInput(screen, "Cash").checked).toBe(false);

  await expectNoAccessibilityViolations(screen.container);
});

test("clicking the already-chosen option changes nothing", async () => {
  const onChange = vi.fn();
  const screen = await render(<RadioGroup {...baseProps({ value: "cash", onChange })} />);

  await userEvent.click(radioLabel(screen, "Cash"));

  expect(onChange).not.toHaveBeenCalled();
  expect(radioInput(screen, "Cash").checked).toBe(true);

  await expectNoAccessibilityViolations(screen.container);
});

test("is a single tab stop landing on the chosen option", async () => {
  const screen = await render(
    <>
      <button type="button">Before</button>
      <RadioGroup {...baseProps({ value: "card" })} />
      <button type="button">After</button>
    </>,
  );

  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Before" }).element());

  await userEvent.tab();
  expect(document.activeElement).toBe(radioInput(screen, "Card"));

  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "After" }).element());

  await expectNoAccessibilityViolations(screen.container);
});

test("moves focus and choice with the arrow keys, wrapping past either end", async () => {
  const screen = await render(<Harness />);

  // Each arrow key both moves focus and chooses the option it lands on, so every step asserts
  // the two together.
  async function expectArrowLandsOn(key: "{ArrowDown}" | "{ArrowUp}", name: string) {
    await userEvent.keyboard(key);
    expect(document.activeElement).toBe(radioInput(screen, name));
    expect(radioInput(screen, name).checked).toBe(true);
  }

  await userEvent.tab();
  expect(document.activeElement).toBe(radioInput(screen, "Cash"));

  await expectArrowLandsOn("{ArrowDown}", "Card");
  await expectArrowLandsOn("{ArrowDown}", "Transfer");
  await expectArrowLandsOn("{ArrowDown}", "Cash");

  await expectArrowLandsOn("{ArrowUp}", "Transfer");
  await expectArrowLandsOn("{ArrowUp}", "Card");

  await expectNoAccessibilityViolations(screen.container);
});

test("shows the package's focus ring on the focused circle", async () => {
  const screen = await render(<RadioGroup {...baseProps()} />);
  const circle = radioCircle(screen, "Cash");

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(circle).outlineWidth).toBe("3px");
  await expect.poll(() => getComputedStyle(circle).outlineOffset).toBe("3px");
  await expect
    .poll(() => getComputedStyle(circle).outlineColor)
    .toBe(tokenRgb("brand-blue-strong"));

  await expectNoAccessibilityViolations(screen.container);
});

test("dims every option to 45% opacity, drops the pointer cursor and blocks focus when disabled", async () => {
  const screen = await render(
    <>
      <RadioGroup {...baseProps({ disabled: true })} />
      <button type="button">Next control</button>
    </>,
  );
  const input = radioInput(screen, "Cash");
  const nextControl = screen.getByRole("button", { name: "Next control" }).element();

  // The dimming is drawn per option label, not on the group container, so every option has to
  // carry it.
  for (const option of options) {
    const label = radioLabel(screen, option.label);
    expect(getComputedStyle(label).opacity).toBe("0.45");
    // The hand cursor promises a control that responds; a disabled option doesn't.
    expect(getComputedStyle(label).cursor).toBe("default");
    expect(radioInput(screen, option.label).disabled).toBe(true);
  }

  await userEvent.tab();
  expect(document.activeElement).toBe(nextControl);
  expect(document.activeElement).not.toBe(input);

  await expectNoAccessibilityViolations(screen.container);
});

test("exposes the group as a radiogroup named by the caller's label", async () => {
  const screen = await render(<RadioGroup {...baseProps({ label: "Payment method" })} />);

  await expect.element(screen.getByRole("radiogroup", { name: "Payment method" })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("exposes each option as a radio button named by its label, with its checked state", async () => {
  const screen = await render(<RadioGroup {...baseProps({ value: "card" })} />);

  await expect.element(screen.getByRole("radio", { name: "Cash" })).not.toBeChecked();
  await expect.element(screen.getByRole("radio", { name: "Card" })).toBeChecked();

  await expectNoAccessibilityViolations(screen.container);
});

// See Button.test.tsx's icon/label tests for the same "does not compile" pattern: the caller's
// input is checked at the type level, not just at runtime.
test("does not accept a group without a label, options, a chosen value or an onChange handler", () => {
  expectTypeOf<{
    options: typeof options;
    value: PaymentMethod;
    onChange: (value: PaymentMethod) => void;
  }>().not.toExtend<RadioGroupProps<PaymentMethod>>();
  expectTypeOf<{
    label: string;
    value: PaymentMethod;
    onChange: (value: PaymentMethod) => void;
  }>().not.toExtend<RadioGroupProps<PaymentMethod>>();
  expectTypeOf<{
    label: string;
    options: typeof options;
    onChange: (value: PaymentMethod) => void;
  }>().not.toExtend<RadioGroupProps<PaymentMethod>>();
  expectTypeOf<{
    label: string;
    options: typeof options;
    value: PaymentMethod;
  }>().not.toExtend<RadioGroupProps<PaymentMethod>>();
});

// Mirrors OptionCardGroup.test.tsx: "exactly one option is always chosen" is enforced at the
// type level, since `value` is pinned to the union of the group's own option values (inferred
// from `options`) and `options` is a non-empty tuple, so neither an out-of-domain value nor an
// empty group compiles.
test("does not accept a chosen value outside the group's own options, or an empty options list", () => {
  expectTypeOf<{
    label: string;
    options: typeof options;
    value: "other";
    onChange: (value: PaymentMethod) => void;
  }>().not.toExtend<RadioGroupProps<PaymentMethod>>();

  expectTypeOf<{
    label: string;
    options: [];
    value: PaymentMethod;
    onChange: (value: PaymentMethod) => void;
  }>().not.toExtend<RadioGroupProps<PaymentMethod>>();
});

// This proves the NoInfer fix at a real call site with no explicit type argument, the way JSX
// actually invokes the component, against the exported RadioGroupProps itself: TypeScript must
// reject `value: "other"` by inferring V from `options` alone rather than by widening V to also
// cover `value`. Unlike OptionCardGroup's OptionCardOption, RadioOption carries no element-typed
// field (just `value` and `label`), so nothing here breaks overload inference and no mirror type
// projecting `options` down to `Pick<RadioOption<V>, "value">` is needed. The "invalid" call still
// has to compile — this file bans `@ts-expect-error` — so an object that fails the first
// overload's `RadioGroupProps<V>` constraint just falls through to the second, `unknown` overload
// and resolves to `false` instead of refusing to typecheck; that `false` is what the assertion
// below actually proves.
function isValidRadioGroupCall<V extends string>(props: RadioGroupProps<V>): true;
function isValidRadioGroupCall(props: unknown): false;
function isValidRadioGroupCall(_props: unknown): boolean {
  return true;
}

test("cannot widen V through `value` at a real call site with no explicit type argument", () => {
  const validCall = isValidRadioGroupCall({
    label: "Payment method",
    options: [
      { value: "cash", label: "Cash" },
      { value: "card", label: "Card" },
    ],
    value: "cash",
    onChange: () => {},
  });
  expectTypeOf(validCall).toEqualTypeOf<true>();

  const invalidCall = isValidRadioGroupCall({
    label: "Payment method",
    options: [
      { value: "cash", label: "Cash" },
      { value: "card", label: "Card" },
    ],
    value: "other",
    onChange: () => {},
  });
  expectTypeOf(invalidCall).toEqualTypeOf<false>();
});
