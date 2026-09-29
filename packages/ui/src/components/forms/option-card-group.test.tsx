import { Banknote, CreditCard, Wallet } from "lucide-react";
import { useId, useState } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { insetBoundary, tokenRgb } from "../../test/token-colors";
import type { Icon } from "../shared/icon";
import type { FieldErrorProps } from "./field-error";
import type { NarrowedOption, Option } from "./option";
import { OptionCardGroup, type OptionCardGroupProps } from "./option-card-group";

type MovementValue = "income" | "expense" | "withdrawal";

const options: [
  NarrowedOption<MovementValue, "description" | "icon">,
  NarrowedOption<MovementValue, "description" | "icon">,
  NarrowedOption<MovementValue, "description" | "icon">,
] = [
  {
    value: "income",
    icon: <Wallet />,
    label: "Income",
    description: "Money coming into the register",
  },
  {
    value: "expense",
    icon: <Banknote />,
    label: "Expense",
    description: "Money going out of the register",
  },
  {
    value: "withdrawal",
    icon: <CreditCard />,
    label: "Withdrawal",
    description: "Cash taken out for the bank",
  },
];

type BaseGroupProps = Omit<OptionCardGroupProps<MovementValue>, keyof FieldErrorProps>;

function baseProps(overrides: Partial<BaseGroupProps> = {}): BaseGroupProps {
  return {
    label: "Movement type",
    options,
    value: "income",
    onChange: () => {},
    ...overrides,
  };
}

type Screen = Awaited<ReturnType<typeof render>>;

// The "radio" role resolves to react-aria's visually hidden native <input>; this package's
// styling, hover state and pointer target live on the <label> that wraps it instead.
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
});

test("shows the hand cursor on each card", async () => {
  const screen = await render(<OptionCardGroup {...baseProps()} />);

  for (const option of options) {
    expect(getComputedStyle(radioCard(screen, option.label)).cursor).toBe("pointer");
  }
});

test("renders each card's icon, title and help text", async () => {
  const screen = await render(<OptionCardGroup {...baseProps()} />);

  for (const option of options) {
    const card = radioCard(screen, option.label);
    expect(card.querySelector("svg")).not.toBeNull();
    await expect.element(screen.getByText(option.description)).toBeVisible();
  }
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
});

test("renders the icon at 20px, the title at 16px bold and the help text at 12px regular", async () => {
  const screen = await render(<OptionCardGroup {...baseProps()} />);
  const icon = radioCard(screen, "Income").querySelector("svg") as SVGSVGElement;
  const title = screen.getByText("Income", { exact: true }).element() as HTMLElement;
  const description = screen
    .getByText("Money coming into the register", { exact: true })
    .element() as HTMLElement;

  const iconRect = icon.getBoundingClientRect();
  expect(iconRect.width).toBeGreaterThan(19);
  expect(iconRect.width).toBeLessThan(21);
  expect(iconRect.height).toBeGreaterThan(19);
  expect(iconRect.height).toBeLessThan(21);

  expect(getComputedStyle(title).fontSize).toBe("16px");
  expect(getComputedStyle(title).fontWeight).toBe("700");
  expect(getComputedStyle(description).fontSize).toBe("12px");
  expect(getComputedStyle(description).fontWeight).toBe("400");
});

test("sits the help text directly under the title, with no gap between them", async () => {
  const screen = await render(<OptionCardGroup {...baseProps()} />);
  const title = screen.getByText("Income", { exact: true }).element() as HTMLElement;
  const description = screen
    .getByText("Money coming into the register", { exact: true })
    .element() as HTMLElement;

  const gap = description.getBoundingClientRect().top - title.getBoundingClientRect().bottom;
  expect(gap).toBeCloseTo(0, 0);
});

test("colors a not-chosen card white with a 1px line border, secondary icon, ink title and secondary help text", async () => {
  const screen = await render(<OptionCardGroup {...baseProps({ value: "expense" })} />);
  const card = radioCard(screen, "Income");
  const icon = card.querySelector("svg") as SVGSVGElement;
  const title = screen.getByText("Income", { exact: true }).element() as HTMLElement;
  const description = screen
    .getByText("Money coming into the register", { exact: true })
    .element() as HTMLElement;
  const style = getComputedStyle(card);

  expect(style.backgroundColor).toBe(tokenRgb("surface"));
  expect(style.boxShadow).toContain(insetBoundary("border", "1px"));
  expect(getComputedStyle(icon).color).toBe(tokenRgb("text-subtle"));
  expect(getComputedStyle(title).color).toBe(tokenRgb("text"));
  expect(getComputedStyle(description).color).toBe(tokenRgb("text-subtle"));
});

test("turns a hovered not-chosen card's background bone without changing its other colors", async () => {
  const screen = await render(<OptionCardGroup {...baseProps({ value: "expense" })} />);
  const card = radioCard(screen, "Income");
  const icon = card.querySelector("svg") as SVGSVGElement;
  const title = screen.getByText("Income", { exact: true }).element() as HTMLElement;

  await userEvent.hover(card);
  await expect.poll(() => getComputedStyle(card).backgroundColor).toBe(tokenRgb("surface-subtle"));

  expect(getComputedStyle(card).boxShadow).toContain(insetBoundary("border", "1px"));
  expect(getComputedStyle(icon).color).toBe(tokenRgb("text-subtle"));
  expect(getComputedStyle(title).color).toBe(tokenRgb("text"));
});

test("colors the chosen card with the blue message background, a 2px blue border, and blue strong icon and title", async () => {
  const screen = await render(<OptionCardGroup {...baseProps({ value: "income" })} />);
  const card = radioCard(screen, "Income");
  const icon = card.querySelector("svg") as SVGSVGElement;
  const title = screen.getByText("Income", { exact: true }).element() as HTMLElement;
  const description = screen
    .getByText("Money coming into the register", { exact: true })
    .element() as HTMLElement;
  const style = getComputedStyle(card);

  expect(style.backgroundColor).toBe(tokenRgb("action-subtle"));
  expect(style.boxShadow).toContain(insetBoundary("action", "2px"));
  expect(getComputedStyle(icon).color).toBe(tokenRgb("text-accent"));
  expect(getComputedStyle(title).color).toBe(tokenRgb("text-accent"));
  expect(getComputedStyle(description).color).toBe(tokenRgb("text-subtle"));
});

test("does not change the chosen card's background on hover", async () => {
  const screen = await render(<OptionCardGroup {...baseProps({ value: "income" })} />);
  const card = radioCard(screen, "Income");

  await userEvent.hover(card);
  await expect.poll(() => card.hasAttribute("data-hovered")).toBe(true);

  expect(getComputedStyle(card).backgroundColor).toBe(tokenRgb("action-subtle"));
});

test("keeps the card's size stable when its border grows from 1px to 2px on choosing it", async () => {
  const notChosenScreen = await render(<OptionCardGroup {...baseProps({ value: "expense" })} />);
  const notChosenRect = radioCard(notChosenScreen, "Income").getBoundingClientRect();
  await notChosenScreen.unmount();

  const chosenScreen = await render(<OptionCardGroup {...baseProps({ value: "income" })} />);
  const chosenRect = radioCard(chosenScreen, "Income").getBoundingClientRect();

  expect(chosenRect.width).toBeCloseTo(notChosenRect.width, 0);
  expect(chosenRect.height).toBeCloseTo(notChosenRect.height, 0);
});

test("wraps a long title and a long help text inside the card", async () => {
  const longTitle = "A very long title that does not fit on a single line of this narrow card";
  const longHelpText =
    "A very long help text that also does not fit on a single line and must wrap onto more than one";
  const longOptions: [
    NarrowedOption<"long" | "short", "description" | "icon">,
    NarrowedOption<"long" | "short", "description" | "icon">,
  ] = [
    { value: "long", icon: <Wallet />, label: longTitle, description: longHelpText },
    { value: "short", icon: <Banknote />, label: "Short", description: "Short help" },
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
  const description = screen.getByText(longHelpText, { exact: true }).element() as HTMLElement;

  const titleLineHeight = Number.parseFloat(getComputedStyle(title).lineHeight);
  const helpLineHeight = Number.parseFloat(getComputedStyle(description).lineHeight);

  expect(title.getBoundingClientRect().height).toBeGreaterThan(titleLineHeight * 1.5);
  expect(description.getBoundingClientRect().height).toBeGreaterThan(helpLineHeight * 1.5);

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
});

test("clicking the already-chosen card changes nothing", async () => {
  const onChange = vi.fn();
  const screen = await render(<OptionCardGroup {...baseProps({ value: "income", onChange })} />);

  await userEvent.click(radioCard(screen, "Income"));

  expect(onChange).not.toHaveBeenCalled();
  expect(radioInput(screen, "Income").checked).toBe(true);
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
  await expect.poll(() => getComputedStyle(card).outlineColor).toBe(tokenRgb("focus"));
});

test("exposes the group as a radiogroup named by the caller's label", async () => {
  const screen = await render(<OptionCardGroup {...baseProps({ label: "Movement type" })} />);

  await expect.element(screen.getByRole("radiogroup", { name: "Movement type" })).toBeVisible();
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
});

test("does not accept an option without an icon, label or description", () => {
  type CardOptions = OptionCardGroupProps<"income">["options"];
  expectTypeOf<
    [{ value: "income"; label: string; description: string }]
  >().not.toExtend<CardOptions>();
  expectTypeOf<
    [{ value: "income"; icon: Icon; description: string }]
  >().not.toExtend<CardOptions>();
  expectTypeOf<[{ value: "income"; icon: Icon; label: string }]>().not.toExtend<CardOptions>();
  expectTypeOf<
    [{ value: "income"; icon: Icon; label: string; description: string }]
  >().toExtend<CardOptions>();
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

// `icon`/`title`/`description` are left out here because a `ReactElement` field breaks TypeScript's
// overload-based inference below, which would make even a valid call wrongly resolve to the
// "invalid" branch. The first (generic) overload only matches a call whose `value`/`onChange`
// truly fit the inferred V; an invalid call falls through to the fallback overload instead,
// resolving to `false`.
type OptionCardGroupValueOnlyProps<V extends string> = {
  options: readonly [{ value: V }, ...{ value: V }[]];
  value: OptionCardGroupProps<V>["value"];
  onChange: OptionCardGroupProps<V>["onChange"];
};

function isValidOptionCardGroupCall<V extends string>(
  props: OptionCardGroupValueOnlyProps<V>,
): true;
function isValidOptionCardGroupCall(props: unknown): false;
// The implementation is a stub: only the overload TypeScript picks matters, not a runtime result.
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
    expect(radioInput(screen, option.label).checked).toBe(false);
  }
});

test("choosing a card when nothing is chosen yet calls onChange with that card's value", async () => {
  const onChange = vi.fn();
  const screen = await render(<OptionCardGroup {...baseProps({ value: null, onChange })} />);

  await userEvent.click(radioCard(screen, "Expense"));

  expect(onChange).toHaveBeenCalledWith("expense");
});

test("shows the error message and marks the group invalid when nothing is chosen", async () => {
  const screen = await render(
    <OptionCardGroup {...baseProps({ value: null })} errorMessage="Elegí una opción." />,
  );

  await expect.element(screen.getByText("Elegí una opción.")).toBeVisible();
  const group = screen.getByRole("radiogroup", { name: "Movement type" }).element() as HTMLElement;
  expect(group.getAttribute("aria-invalid")).toBe("true");
});

function OptionCardGroupWithSharedErrorMessage() {
  const errorId = useId();
  return (
    <>
      <OptionCardGroup {...baseProps({ value: null })} errorMessageId={errorId} />
      <p id={errorId}>Compartido por otro campo.</p>
    </>
  );
}

test("marks the group invalid, described by a shared message rendered outside it through errorMessageId", async () => {
  const screen = await render(<OptionCardGroupWithSharedErrorMessage />);
  const group = screen.getByRole("radiogroup", { name: "Movement type" }).element() as HTMLElement;
  const sharedMessage = screen.getByText("Compartido por otro campo.").element();

  expect(group.getAttribute("aria-invalid")).toBe("true");
  expect(group.getAttribute("aria-describedby")).toBe(sharedMessage.id);

  await expectNoAccessibilityViolations(screen.container);
});

test("describes the group by its own error message", async () => {
  const screen = await render(
    <OptionCardGroup {...baseProps({ value: null })} errorMessage="Elegí una opción." />,
  );
  const group = screen.getByRole("radiogroup", { name: "Movement type" }).element() as HTMLElement;
  const message = screen.getByText("Elegí una opción.").element();

  expect(group.getAttribute("aria-describedby")).toBe(message.id);
});

test("exposes a group without an error message as valid, described by nothing", async () => {
  const screen = await render(<OptionCardGroup {...baseProps({ value: null })} />);
  const group = screen.getByRole("radiogroup", { name: "Movement type" }).element() as HTMLElement;

  expect(group.getAttribute("aria-invalid")).not.toBe("true");
  expect(group.getAttribute("aria-describedby")).toBeNull();
});

test("does not show an error message when not invalid", async () => {
  const screen = await render(<OptionCardGroup {...baseProps({ value: null })} />);

  expect(screen.getByText("Elegí una opción.").query()).toBeNull();
});

test("exposes a required group as required, and an optional one as not required", async () => {
  const screen = await render(
    <>
      <OptionCardGroup {...baseProps({ label: "Required group", required: true })} />
      <OptionCardGroup {...baseProps({ label: "Optional group" })} />
    </>,
  );

  const required = screen.getByRole("radiogroup", { name: "Required group" }).element();
  const optional = screen.getByRole("radiogroup", { name: "Optional group" }).element();
  expect(required.getAttribute("aria-required")).toBe("true");
  expect(optional.getAttribute("aria-required")).not.toBe("true");

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

test("has no invalid prop, since an error message or a shared error message id makes the group invalid", () => {
  expectTypeOf<OptionCardGroupProps<MovementValue>>().not.toHaveProperty("invalid");
});

test("does not accept both its own message and a shared one", () => {
  expectTypeOf<{
    label: string;
    options: typeof options;
    value: MovementValue;
    onChange: (value: MovementValue) => void;
    errorMessage: string;
    errorMessageId: string;
  }>().not.toExtend<OptionCardGroupProps<MovementValue>>();
});

test("accepts an error message, a shared error message id, or neither", () => {
  expectTypeOf<{
    label: string;
    options: typeof options;
    value: MovementValue;
    onChange: (value: MovementValue) => void;
    errorMessage: string | undefined;
  }>().toExtend<OptionCardGroupProps<MovementValue>>();
  expectTypeOf<{
    label: string;
    options: typeof options;
    value: MovementValue;
    onChange: (value: MovementValue) => void;
    errorMessageId: string;
  }>().toExtend<OptionCardGroupProps<MovementValue>>();
});

test("does not name its secondary text helpText", () => {
  expectTypeOf<Option>().not.toHaveProperty("helpText");
});

test("reports the chosen card's value, never null", () => {
  expectTypeOf<OptionCardGroupProps<MovementValue>["onChange"]>().parameters.toEqualTypeOf<
    [MovementValue]
  >();
});
