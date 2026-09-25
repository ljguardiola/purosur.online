import { Banknote, CreditCard, Wallet } from "lucide-react";
import { useState } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { insetBoundary, tokenRgb } from "../test/token-colors";
import type { OptionCardIcon, OptionCardOption } from "./OptionCardGroup";
import { OptionCardGroup, type OptionCardGroupProps } from "./OptionCardGroup";

type MovementValue = "income" | "expense" | "withdrawal";

const options: [
  OptionCardOption<MovementValue>,
  OptionCardOption<MovementValue>,
  OptionCardOption<MovementValue>,
] = [
  {
    value: "income",
    icon: <Wallet />,
    title: "Income",
    helpText: "Money coming into the register",
  },
  {
    value: "expense",
    icon: <Banknote />,
    title: "Expense",
    helpText: "Money going out of the register",
  },
  {
    value: "withdrawal",
    icon: <CreditCard />,
    title: "Withdrawal",
    helpText: "Cash taken out for the bank",
  },
];

// The helper supplies every field a real caller must pass, so a test only overrides what it is
// checking.
function baseProps(
  overrides: Partial<OptionCardGroupProps<MovementValue>> = {},
): OptionCardGroupProps<MovementValue> {
  return {
    label: "Movement type",
    options,
    value: "income",
    onChange: () => {},
    ...overrides,
  };
}

type Screen = Awaited<ReturnType<typeof render>>;

// The "radio" accessibility role resolves to react-aria's underlying (visually hidden) native
// <input>, since that's the element that actually carries the role natively. This package's
// styling, hover state and pointer target all live on the visible <label> that wraps it instead,
// so every style or interaction assertion goes through this helper rather than the role query.
function radioInput(screen: Screen, title: string): HTMLInputElement {
  return screen.getByRole("radio", { name: title }).element() as HTMLInputElement;
}

function radioCard(screen: Screen, title: string): HTMLElement {
  return radioInput(screen, title).closest("label") as HTMLElement;
}

test("renders the group as a single row of equally wide cards, 12px apart", async () => {
  const screen = await render(<OptionCardGroup {...baseProps()} />);
  await expect.element(screen.getByRole("radiogroup", { name: "Movement type" })).toBeVisible();

  const incomeRect = radioCard(screen, "Income").getBoundingClientRect();
  const expenseRect = radioCard(screen, "Expense").getBoundingClientRect();
  const withdrawalRect = radioCard(screen, "Withdrawal").getBoundingClientRect();

  expect(expenseRect.width).toBeCloseTo(incomeRect.width, 0);
  expect(withdrawalRect.width).toBeCloseTo(incomeRect.width, 0);

  const firstGap = expenseRect.left - incomeRect.right;
  const secondGap = withdrawalRect.left - expenseRect.right;
  expect(firstGap).toBeGreaterThan(11);
  expect(firstGap).toBeLessThan(13);
  expect(secondGap).toBeGreaterThan(11);
  expect(secondGap).toBeLessThan(13);

  await expectNoAccessibilityViolations(screen.container);
});

test("shows the hand cursor on each card", async () => {
  const screen = await render(<OptionCardGroup {...baseProps()} />);

  for (const option of options) {
    expect(getComputedStyle(radioCard(screen, option.title)).cursor).toBe("pointer");
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("renders each card's icon, title and help text", async () => {
  const screen = await render(<OptionCardGroup {...baseProps()} />);

  for (const option of options) {
    const card = radioCard(screen, option.title);
    expect(card.querySelector("svg")).not.toBeNull();
    await expect.element(screen.getByText(option.helpText)).toBeVisible();
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("gives every card the 12/16px padding, 8px radius and 12px icon-to-text gap", async () => {
  const screen = await render(<OptionCardGroup {...baseProps()} />);
  const style = getComputedStyle(radioCard(screen, "Income"));

  expect(style.paddingTop).toBe("12px");
  expect(style.paddingBottom).toBe("12px");
  expect(style.paddingLeft).toBe("16px");
  expect(style.paddingRight).toBe("16px");
  expect(style.borderRadius).toBe("8px");
  expect(style.columnGap).toBe("12px");
  expect(style.alignItems).toBe("center");

  await expectNoAccessibilityViolations(screen.container);
});

test("renders the icon at 20px, the title at 16px bold and the help text at 12px regular", async () => {
  const screen = await render(<OptionCardGroup {...baseProps()} />);
  const icon = radioCard(screen, "Income").querySelector("svg") as SVGSVGElement;
  const title = screen.getByText("Income", { exact: true }).element() as HTMLElement;
  const helpText = screen
    .getByText("Money coming into the register", { exact: true })
    .element() as HTMLElement;

  const iconRect = icon.getBoundingClientRect();
  expect(iconRect.width).toBeGreaterThan(19);
  expect(iconRect.width).toBeLessThan(21);
  expect(iconRect.height).toBeGreaterThan(19);
  expect(iconRect.height).toBeLessThan(21);

  expect(getComputedStyle(title).fontSize).toBe("16px");
  expect(getComputedStyle(title).fontWeight).toBe("700");
  expect(getComputedStyle(helpText).fontSize).toBe("12px");
  expect(getComputedStyle(helpText).fontWeight).toBe("400");

  await expectNoAccessibilityViolations(screen.container);
});

test("sits the help text directly under the title, with no gap between them", async () => {
  const screen = await render(<OptionCardGroup {...baseProps()} />);
  const title = screen.getByText("Income", { exact: true }).element() as HTMLElement;
  const helpText = screen
    .getByText("Money coming into the register", { exact: true })
    .element() as HTMLElement;

  const gap = helpText.getBoundingClientRect().top - title.getBoundingClientRect().bottom;
  expect(gap).toBeCloseTo(0, 0);

  await expectNoAccessibilityViolations(screen.container);
});

test("colors a not-chosen card white with a 1px line border, secondary icon, ink title and secondary help text", async () => {
  const screen = await render(<OptionCardGroup {...baseProps({ value: "expense" })} />);
  const card = radioCard(screen, "Income");
  const icon = card.querySelector("svg") as SVGSVGElement;
  const title = screen.getByText("Income", { exact: true }).element() as HTMLElement;
  const helpText = screen
    .getByText("Money coming into the register", { exact: true })
    .element() as HTMLElement;
  const style = getComputedStyle(card);

  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(style.boxShadow).toContain(insetBoundary("line", "1px"));
  expect(getComputedStyle(icon).color).toBe(tokenRgb("ink-secondary"));
  expect(getComputedStyle(title).color).toBe(tokenRgb("ink"));
  expect(getComputedStyle(helpText).color).toBe(tokenRgb("ink-secondary"));

  await expectNoAccessibilityViolations(screen.container);
});

test("turns a hovered not-chosen card's background bone without changing its other colors", async () => {
  const screen = await render(<OptionCardGroup {...baseProps({ value: "expense" })} />);
  const card = radioCard(screen, "Income");
  const icon = card.querySelector("svg") as SVGSVGElement;
  const title = screen.getByText("Income", { exact: true }).element() as HTMLElement;

  await userEvent.hover(card);
  await expect.poll(() => getComputedStyle(card).backgroundColor).toBe(tokenRgb("surface-bone"));

  expect(getComputedStyle(card).boxShadow).toContain(insetBoundary("line", "1px"));
  expect(getComputedStyle(icon).color).toBe(tokenRgb("ink-secondary"));
  expect(getComputedStyle(title).color).toBe(tokenRgb("ink"));

  await expectNoAccessibilityViolations(screen.container);
});

test("colors the chosen card with the blue message background, a 2px blue border, and blue strong icon and title", async () => {
  const screen = await render(<OptionCardGroup {...baseProps({ value: "income" })} />);
  const card = radioCard(screen, "Income");
  const icon = card.querySelector("svg") as SVGSVGElement;
  const title = screen.getByText("Income", { exact: true }).element() as HTMLElement;
  const helpText = screen
    .getByText("Money coming into the register", { exact: true })
    .element() as HTMLElement;
  const style = getComputedStyle(card);

  expect(style.backgroundColor).toBe(tokenRgb("brand-blue-message-bg"));
  expect(style.boxShadow).toContain(insetBoundary("brand-blue-ui", "2px"));
  expect(getComputedStyle(icon).color).toBe(tokenRgb("brand-blue-strong"));
  expect(getComputedStyle(title).color).toBe(tokenRgb("brand-blue-strong"));
  expect(getComputedStyle(helpText).color).toBe(tokenRgb("ink-secondary"));

  await expectNoAccessibilityViolations(screen.container);
});

test("does not change the chosen card's background on hover", async () => {
  const screen = await render(<OptionCardGroup {...baseProps({ value: "income" })} />);
  const card = radioCard(screen, "Income");

  await userEvent.hover(card);
  // Without this, the test would pass even if the hover never registered at all: it proves the
  // card really is in the hovered state before asserting that its background didn't react to it.
  await expect.poll(() => card.hasAttribute("data-hovered")).toBe(true);

  expect(getComputedStyle(card).backgroundColor).toBe(tokenRgb("brand-blue-message-bg"));
  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the card's size stable when its border grows from 1px to 2px on choosing it", async () => {
  const notChosenScreen = await render(<OptionCardGroup {...baseProps({ value: "expense" })} />);
  const notChosenRect = radioCard(notChosenScreen, "Income").getBoundingClientRect();
  await notChosenScreen.unmount();

  const chosenScreen = await render(<OptionCardGroup {...baseProps({ value: "income" })} />);
  const chosenRect = radioCard(chosenScreen, "Income").getBoundingClientRect();

  expect(chosenRect.width).toBeCloseTo(notChosenRect.width, 0);
  expect(chosenRect.height).toBeCloseTo(notChosenRect.height, 0);

  await expectNoAccessibilityViolations(chosenScreen.container);
});

test("wraps a long title and a long help text inside the card", async () => {
  const longTitle = "A very long title that does not fit on a single line of this narrow card";
  const longHelpText =
    "A very long help text that also does not fit on a single line and must wrap onto more than one";
  const longOptions: [OptionCardOption<"long" | "short">, OptionCardOption<"long" | "short">] = [
    { value: "long", icon: <Wallet />, title: longTitle, helpText: longHelpText },
    { value: "short", icon: <Banknote />, title: "Short", helpText: "Short help" },
  ];
  const screen = await render(
    <div style={{ width: "360px" }}>
      <OptionCardGroup
        label="Movement type"
        options={longOptions}
        value="short"
        onChange={() => {}}
      />
    </div>,
  );
  const title = screen.getByText(longTitle, { exact: true }).element() as HTMLElement;
  const helpText = screen.getByText(longHelpText, { exact: true }).element() as HTMLElement;

  const titleLineHeight = Number.parseFloat(getComputedStyle(title).lineHeight);
  const helpLineHeight = Number.parseFloat(getComputedStyle(helpText).lineHeight);

  expect(title.getBoundingClientRect().height).toBeGreaterThan(titleLineHeight * 1.5);
  expect(helpText.getBoundingClientRect().height).toBeGreaterThan(helpLineHeight * 1.5);

  await expectNoAccessibilityViolations(screen.container);
});

test("chooses a card with a click, unchoosing the previous one", async () => {
  function Harness() {
    const [value, setValue] = useState<MovementValue>("income");
    return <OptionCardGroup {...baseProps({ value, onChange: setValue })} />;
  }

  const screen = await render(<Harness />);

  await userEvent.click(radioCard(screen, "Expense"));

  expect(radioInput(screen, "Expense").checked).toBe(true);
  expect(radioInput(screen, "Income").checked).toBe(false);

  await expectNoAccessibilityViolations(screen.container);
});

test("clicking the already-chosen card changes nothing", async () => {
  const onChange = vi.fn();
  const screen = await render(<OptionCardGroup {...baseProps({ value: "income", onChange })} />);

  await userEvent.click(radioCard(screen, "Income"));

  expect(onChange).not.toHaveBeenCalled();
  expect(radioInput(screen, "Income").checked).toBe(true);

  await expectNoAccessibilityViolations(screen.container);
});

test("is a single tab stop landing on the chosen card", async () => {
  const screen = await render(
    <>
      <button type="button">Before</button>
      <OptionCardGroup {...baseProps({ value: "expense" })} />
      <button type="button">After</button>
    </>,
  );

  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Before" }).element());

  await userEvent.tab();
  expect(document.activeElement).toBe(radioInput(screen, "Expense"));

  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "After" }).element());

  await expectNoAccessibilityViolations(screen.container);
});

test("moves focus and choice with the arrow keys", async () => {
  function Harness() {
    const [value, setValue] = useState<MovementValue>("income");
    return <OptionCardGroup {...baseProps({ value, onChange: setValue })} />;
  }

  const screen = await render(<Harness />);

  await userEvent.tab();
  expect(document.activeElement).toBe(radioInput(screen, "Income"));

  await userEvent.keyboard("{ArrowRight}");

  expect(document.activeElement).toBe(radioInput(screen, "Expense"));
  expect(radioInput(screen, "Expense").checked).toBe(true);

  await expectNoAccessibilityViolations(screen.container);
});

test("shows the package's focus ring on the focused card", async () => {
  const screen = await render(<OptionCardGroup {...baseProps()} />);
  const card = radioCard(screen, "Income");

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(card).outlineWidth).toBe("3px");
  await expect.poll(() => getComputedStyle(card).outlineOffset).toBe("3px");
  await expect.poll(() => getComputedStyle(card).outlineColor).toBe(tokenRgb("brand-blue-strong"));

  await expectNoAccessibilityViolations(screen.container);
});

test("exposes the group as a radiogroup named by the caller's label", async () => {
  const screen = await render(<OptionCardGroup {...baseProps({ label: "Movement type" })} />);

  await expect.element(screen.getByRole("radiogroup", { name: "Movement type" })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("exposes each card as a radio button named by its title and described by its help text", async () => {
  const screen = await render(<OptionCardGroup {...baseProps({ value: "expense" })} />);
  const input = radioInput(screen, "Income");
  const describedById = input.getAttribute("aria-describedby");

  expect(describedById).not.toBeNull();
  const description = document.getElementById(describedById as string);
  expect(description?.textContent).toBe("Money coming into the register");

  expect(input.checked).toBe(false);
  expect(radioInput(screen, "Expense").checked).toBe(true);

  await expectNoAccessibilityViolations(screen.container);
});

// See Button.test.tsx's icon/label tests for the same "does not compile" pattern: the caller's
// input is checked at the type level, not just at runtime.
test("does not accept an option without an icon, title or help text", () => {
  expectTypeOf<{
    value: string;
    title: string;
    helpText: string;
  }>().not.toExtend<OptionCardOption>();
  expectTypeOf<{
    value: string;
    icon: OptionCardIcon;
    helpText: string;
  }>().not.toExtend<OptionCardOption>();
  expectTypeOf<{
    value: string;
    icon: OptionCardIcon;
    title: string;
  }>().not.toExtend<OptionCardOption>();
});

test("does not accept a group without a label, a chosen value or an onChange handler", () => {
  expectTypeOf<{
    options: typeof options;
    value: MovementValue;
    onChange: (value: MovementValue) => void;
  }>().not.toExtend<OptionCardGroupProps<MovementValue>>();
  expectTypeOf<{
    label: string;
    options: typeof options;
    onChange: (value: MovementValue) => void;
  }>().not.toExtend<OptionCardGroupProps<MovementValue>>();
  expectTypeOf<{
    label: string;
    options: typeof options;
    value: MovementValue;
  }>().not.toExtend<OptionCardGroupProps<MovementValue>>();
});

// "Exactly one option is always chosen" is enforced at the type level, not just at runtime:
// `value` is pinned to the union of the group's own option values (inferred from `options`), and
// `options` is a non-empty tuple, so neither a value outside the group nor an empty group compiles.
test("does not accept a chosen value outside the group's own options, or an empty options list", () => {
  expectTypeOf<{
    label: string;
    options: typeof options;
    value: "other";
    onChange: (value: MovementValue) => void;
  }>().not.toExtend<OptionCardGroupProps<MovementValue>>();

  expectTypeOf<{
    label: string;
    options: [];
    value: MovementValue;
    onChange: (value: MovementValue) => void;
  }>().not.toExtend<OptionCardGroupProps<MovementValue>>();
});

// Proves the NoInfer fix at a real call site with no explicit type argument, the way JSX actually
// invokes the component: TypeScript must reject `value: "other"` by inferring V from `options`
// alone, not by widening V to also cover `value`. `icon`/`title`/`helpText` are projected away
// (via the real `OptionCardOption<V>`/`OptionCardGroupProps<V>` field types, not a hand-copied
// mirror) since they don't participate in V at all; keeping them breaks TypeScript's overload-based
// generic inference below for an unrelated reason (a `ReactElement` field confuses it), which would
// make even a *valid* call wrongly resolve to the "invalid" branch.
//
// A call that fails to compile can't sit in this file as literal code, and this project bans
// `@ts-expect-error`, so the first (generic) overload only matches a call whose `value`/`onChange`
// truly fit the inferred V; an invalid call falls through to the second (fallback) overload
// instead of failing to compile, resolving to `false`.
type OptionCardGroupValueOnlyProps<V extends string> = {
  options: readonly [Pick<OptionCardOption<V>, "value">, ...Pick<OptionCardOption<V>, "value">[]];
  value: OptionCardGroupProps<V>["value"];
  onChange: OptionCardGroupProps<V>["onChange"];
};

function isValidOptionCardGroupCall<V extends string>(
  props: OptionCardGroupValueOnlyProps<V>,
): true;
function isValidOptionCardGroupCall(props: unknown): false;
// This test only cares about which overload TypeScript picks, never about a runtime result, so
// the implementation itself is a stub: it exists only so the type-only overloads above have a
// real function to call, instead of throwing at runtime.
function isValidOptionCardGroupCall(_props: unknown): boolean {
  return true;
}

test("cannot widen V through `value` at a real call site with no explicit type argument", () => {
  const validCall = isValidOptionCardGroupCall({
    options: [{ value: "income" }, { value: "expense" }],
    value: "income",
    onChange: () => {},
  });
  expectTypeOf(validCall).toEqualTypeOf<true>();

  const invalidCall = isValidOptionCardGroupCall({
    options: [{ value: "income" }, { value: "expense" }],
    value: "other",
    onChange: () => {},
  });
  expectTypeOf(invalidCall).toEqualTypeOf<false>();
});

test("renders with no card chosen when value is null", async () => {
  const screen = await render(<OptionCardGroup {...baseProps({ value: null })} />);

  for (const option of options) {
    expect(radioInput(screen, option.title).checked).toBe(false);
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("choosing a card when nothing is chosen yet calls onChange with that card's value", async () => {
  const onChange = vi.fn();
  const screen = await render(<OptionCardGroup {...baseProps({ value: null, onChange })} />);

  await userEvent.click(radioCard(screen, "Expense"));

  expect(onChange).toHaveBeenCalledWith("expense");

  await expectNoAccessibilityViolations(screen.container);
});

test("shows the error message and marks the group invalid when nothing is chosen", async () => {
  const screen = await render(
    <OptionCardGroup {...baseProps({ value: null })} invalid errorMessage="Elegí una opción." />,
  );

  await expect.element(screen.getByText("Elegí una opción.")).toBeVisible();
  const group = screen.getByRole("radiogroup", { name: "Movement type" }).element() as HTMLElement;
  expect(group.getAttribute("aria-invalid")).toBe("true");

  await expectNoAccessibilityViolations(screen.container);
});

test("does not show an error message when not invalid", async () => {
  const screen = await render(<OptionCardGroup {...baseProps({ value: null })} />);

  expect(screen.getByText("Elegí una opción.").query()).toBeNull();

  await expectNoAccessibilityViolations(screen.container);
});

test("accepts a null value for no selection yet", () => {
  expectTypeOf<{
    label: string;
    options: typeof options;
    value: null;
    onChange: (value: MovementValue) => void;
  }>().toExtend<OptionCardGroupProps<MovementValue>>();
});

test("does not accept an invalid group without an error message", () => {
  expectTypeOf<{
    label: string;
    options: typeof options;
    value: MovementValue;
    onChange: (value: MovementValue) => void;
    invalid: true;
  }>().not.toExtend<OptionCardGroupProps<MovementValue>>();
});
