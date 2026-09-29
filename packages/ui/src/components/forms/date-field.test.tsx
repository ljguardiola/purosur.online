import { CalendarDate } from "@internationalized/date";
import { useId, useState } from "react";
import { afterEach, beforeEach, expect, expectTypeOf, test, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { AA_TEXT_CONTRAST, contrastRatio } from "../../styles/contrast";
import { expectNoAccessibilityViolations } from "../../test/axe";
import type { DispatchableCdpSession } from "../../test/setup-browser";
import { insetBoundary, paintedBoxShadowLayers, rgbToHex, tokenRgb } from "../../test/token-colors";
import { DateField, type DateFieldProps } from "./date-field";
import { type FieldSize, FieldSizeProvider } from "./field-size";

type Screen = Awaited<ReturnType<typeof render>>;

function fieldGroup(screen: Screen, name: string): HTMLElement {
  return screen.getByRole("group", { name }).element() as HTMLElement;
}

// vitest-browser-react's default viewport is phone-sized and leaves no room for the calendar
// panel below the field. The dispatched mouse move gives React Aria a real pointer position
// before the first hover-driven assertion.
beforeEach(async () => {
  await page.viewport(1280, 900);
  const session = cdp() as unknown as DispatchableCdpSession;
  await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
});

// Not `Omit<DateFieldProps, "value" | "onChange">`: DateFieldRangeProps is a union with no common
// discriminant field, so Omit collapses it into a shape TypeScript can no longer match back to a
// single member under `exactOptionalPropertyTypes`.
//
// `variant` is test-only, not a DateField prop: "register" renders with no FieldSizeProvider, the
// default size, and "backoffice" wraps the field in one.
type NoRangeHarnessProps = {
  variant: FieldSize;
  label: string;
  description?: string;
  disabled?: boolean;
};

function DateFieldHarness({ variant, ...props }: NoRangeHarnessProps) {
  const [value, setValue] = useState<CalendarDate | null>(null);
  const field = <DateField {...props} value={value} onChange={setValue} />;
  return variant === "backoffice" ? (
    <FieldSizeProvider size="backoffice">{field}</FieldSizeProvider>
  ) : (
    field
  );
}

test("renders the register variant at 56px with 16px padding, a leading icon, bold 20px ink value and bold 16px ink label", async () => {
  const screen = await render(<DateFieldHarness variant="register" label="Expiry" />);
  const group = fieldGroup(screen, "Expiry");
  const style = getComputedStyle(group);
  const rect = group.getBoundingClientRect();

  expect(rect.height).toBeCloseTo(56, 0);
  expect(style.borderRadius).toBe("8px");
  expect(Math.round(Number.parseFloat(style.paddingLeft))).toBe(16);
  expect(Math.round(Number.parseFloat(style.paddingRight))).toBe(16);
  expect(style.backgroundColor).toBe(tokenRgb("surface"));

  const icon = group.querySelector("svg") as SVGSVGElement;
  const iconRect = icon.getBoundingClientRect();
  expect(iconRect.width).toBeCloseTo(18, 0);
  expect(iconRect.height).toBeCloseTo(18, 0);
  expect(group.firstElementChild?.contains(icon)).toBe(true);

  const label = screen.getByText("Expiry").element() as HTMLElement;
  expect(getComputedStyle(label).fontWeight).toBe("700");
  expect(Math.round(Number.parseFloat(getComputedStyle(label).fontSize))).toBe(16);
  expect(getComputedStyle(label).color).toBe(tokenRgb("text"));
});

test("renders the backoffice variant with an 8px-radius box and a trailing icon", async () => {
  const screen = await render(<DateFieldHarness variant="backoffice" label="Date" />);
  const group = fieldGroup(screen, "Date");
  const style = getComputedStyle(group);

  expect(style.borderRadius).toBe("8px");

  const icon = group.querySelector("svg") as SVGSVGElement;
  const iconRect = icon.getBoundingClientRect();
  expect(iconRect.width).toBeCloseTo(18, 0);
  expect(iconRect.height).toBeCloseTo(18, 0);
  expect(group.lastElementChild?.contains(icon)).toBe(true);
});

test("shows the helper line under the register field when supplied", async () => {
  const screen = await render(
    <DateFieldHarness
      variant="register"
      label="Expiry"
      description="A different expiry for the same product is entered as a separate line."
    />,
  );

  const helper = screen.getByText(
    "A different expiry for the same product is entered as a separate line.",
  );
  await expect.element(helper).toBeVisible();
});

test("keeps the label 6px above the register field's box", async () => {
  const screen = await render(<DateFieldHarness variant="register" label="Expiry" />);
  const wrapper = fieldGroup(screen, "Expiry").parentElement as HTMLElement;

  expect(Math.round(Number.parseFloat(getComputedStyle(wrapper).rowGap))).toBe(6);
});

for (const variant of ["register", "backoffice"] as const) {
  test(`shows a white box with a 2px line border at rest in the ${variant} variant`, async () => {
    const screen = await render(<DateFieldHarness variant={variant} label="Expiry" />);
    const group = fieldGroup(screen, "Expiry");
    const style = getComputedStyle(group);

    expect(style.backgroundColor).toBe(tokenRgb("surface"));
    expect(paintedBoxShadowLayers(group)).toEqual([insetBoundary("border", "2px")]);
  });

  test(`turns the box bone on hover in the ${variant} variant, keeping the same 2px line border`, async () => {
    const screen = await render(<DateFieldHarness variant={variant} label="Expiry" />);
    const group = fieldGroup(screen, "Expiry");

    await userEvent.hover(group);
    await expect
      .poll(() => getComputedStyle(group).backgroundColor)
      .toBe(tokenRgb("surface-subtle"));
    expect(paintedBoxShadowLayers(group)).toEqual([insetBoundary("border", "2px")]);
  });

  test(`dims the whole field to 45% opacity and blocks focus when disabled in the ${variant} variant`, async () => {
    const screen = await render(
      <>
        <DateFieldHarness variant={variant} label="Expiry" disabled />
        <button type="button">Next control</button>
      </>,
    );
    const group = fieldGroup(screen, "Expiry");
    const wrapper = group.parentElement as HTMLElement;
    const nextControl = screen.getByRole("button", { name: "Next control" }).element();

    expect(getComputedStyle(wrapper).opacity).toBe("0.45");
    expect(getComputedStyle(group).backgroundColor).toBe(tokenRgb("surface"));
    expect(paintedBoxShadowLayers(group)).toEqual([insetBoundary("border", "2px")]);

    await userEvent.tab();
    expect(document.activeElement).toBe(nextControl);

    await expectNoAccessibilityViolations(screen.container);
  });

  test(`shows the hand cursor on the calendar toggle button, and the arrow once the field is disabled, in the ${variant} variant`, async () => {
    const enabledScreen = await render(<DateFieldHarness variant={variant} label="Expiry" />);
    const enabledToggle = fieldGroup(enabledScreen, "Expiry").querySelector(
      "button",
    ) as HTMLElement;
    expect(getComputedStyle(enabledToggle).cursor).toBe("pointer");
    await enabledScreen.unmount();

    const disabledScreen = await render(
      <DateFieldHarness variant={variant} label="Expiry" disabled />,
    );
    const disabledToggle = fieldGroup(disabledScreen, "Expiry").querySelector(
      "button",
    ) as HTMLElement;
    expect(getComputedStyle(disabledToggle).cursor).toBe("default");
  });
}

test("marks the helper line as disabled too when the field itself is disabled", async () => {
  const screen = await render(
    <DateFieldHarness
      variant="register"
      label="Expiry"
      description="A different expiry for the same product is entered as a separate line."
      disabled
    />,
  );

  // The helper line's 45% opacity would otherwise fail the contrast minimum; `aria-disabled`
  // claims the exemption WCAG grants an inactive component's own text.
  const helper = screen
    .getByText("A different expiry for the same product is entered as a separate line.")
    .element();
  expect(helper.getAttribute("aria-disabled")).toBe("true");

  await expectNoAccessibilityViolations(screen.container);
});

test("marks the range message as disabled too when the field itself is disabled", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 3, 15));
    return (
      <DateField
        label="Expiry"
        value={value}
        onChange={setValue}
        minValue={new CalendarDate(2027, 1, 1)}
        maxValue={new CalendarDate(2027, 2, 28)}
        rangeMessage="The date must be 28/02/2027 or earlier."
        disabled
      />
    );
  }
  const screen = await render(<ControlledHarness />);

  const message = screen.getByText("The date must be 28/02/2027 or earlier.").element();
  expect(message.getAttribute("aria-disabled")).toBe("true");

  await expectNoAccessibilityViolations(screen.container);
});

test("reads the date as it is typed, day by day, month by month, and a four-digit year", async () => {
  const screen = await render(<DateFieldHarness variant="register" label="Expiry" />);
  const group = fieldGroup(screen, "Expiry");

  await userEvent.click(group);
  await userEvent.keyboard("28022027");

  expect(group.textContent).toContain("28");
  expect(group.textContent).toContain("02");
  expect(group.textContent).toContain("2027");

  await expectNoAccessibilityViolations(screen.container);
});

function CallerValueHarness({ variant, ...props }: NoRangeHarnessProps) {
  const [value, setValue] = useState<CalendarDate | null>(null);
  const field = (
    <>
      <DateField {...props} value={value} onChange={setValue} />
      <p data-testid="caller-value">{value?.toString() ?? ""}</p>
    </>
  );
  return variant === "backoffice" ? (
    <FieldSizeProvider size="backoffice">{field}</FieldSizeProvider>
  ) : (
    field
  );
}

test("tells the caller the complete date once typing finishes it", async () => {
  const screen = await render(<CallerValueHarness variant="register" label="Expiry" />);
  const group = fieldGroup(screen, "Expiry");

  await userEvent.click(group);
  await userEvent.keyboard("28022027");

  await expect
    .poll(() => screen.getByTestId("caller-value").element().textContent)
    .toBe("2027-02-28");

  await expectNoAccessibilityViolations(screen.container);
});

const RANGE_MIN = new CalendarDate(2027, 1, 1);
const RANGE_MAX = new CalendarDate(2027, 2, 28);
const RANGE_MESSAGE = "The date must be 28/02/2027 or earlier.";
const RANGE_HELPER = "A different expiry for the same product is entered as a separate line.";

function focusedLayers(): string[] {
  return [insetBoundary("action", "2px")];
}

async function focusFirstSegment(group: HTMLElement, variant: FieldSize) {
  await userEvent.tab();
  if (variant === "register") {
    await userEvent.tab();
  }
  expect(document.activeElement).toBe(group.querySelector('[role="spinbutton"]'));
}

for (const variant of ["register", "backoffice"] as const) {
  test(`draws exactly the package's focused box shadow when a segment is focused in the ${variant} variant`, async () => {
    const screen = await render(<DateFieldHarness variant={variant} label="Expiry" />);
    const group = fieldGroup(screen, "Expiry");

    await focusFirstSegment(group, variant);

    await expect.poll(() => paintedBoxShadowLayers(group)).toEqual(focusedLayers());

    await expectNoAccessibilityViolations(screen.container);
  });

  test(`keeps the focused border and white fill instead of the hovered bone one when both apply at once in the ${variant} variant`, async () => {
    const screen = await render(<DateFieldHarness variant={variant} label="Expiry" />);
    const group = fieldGroup(screen, "Expiry");

    await focusFirstSegment(group, variant);
    await userEvent.hover(group);
    await expect.poll(() => group.matches(":hover")).toBe(true);

    await expect.poll(() => paintedBoxShadowLayers(group)).toEqual(focusedLayers());
    expect(getComputedStyle(group).backgroundColor).toBe(tokenRgb("surface"));

    await expectNoAccessibilityViolations(screen.container);
  });

  test(`shows the focused border instead of the out-of-range one once a refused field is focused in the ${variant} variant`, async () => {
    const field = (
      <DateField
        label="Expiry"
        value={new CalendarDate(2027, 3, 15)}
        onChange={() => {}}
        minValue={RANGE_MIN}
        maxValue={RANGE_MAX}
        rangeMessage={RANGE_MESSAGE}
      />
    );
    const screen = await render(
      variant === "backoffice" ? (
        <FieldSizeProvider size="backoffice">{field}</FieldSizeProvider>
      ) : (
        field
      ),
    );
    const group = fieldGroup(screen, "Expiry");

    await focusFirstSegment(group, variant);

    await expect.poll(() => paintedBoxShadowLayers(group)).toEqual(focusedLayers());

    (document.activeElement as HTMLElement).blur();
    await expect.poll(() => paintedBoxShadowLayers(group)).toEqual([insetBoundary("error", "2px")]);

    await expectNoAccessibilityViolations(screen.container);
  });

  test(`tells an empty field's placeholder from a date already entered, by tone, in the ${variant} variant`, async () => {
    const screen = await render(<DateFieldHarness variant={variant} label="Expiry" />);
    const group = fieldGroup(screen, "Expiry");
    const day = group.querySelector('[role="spinbutton"]') as HTMLElement;

    expect(day.getAttribute("data-placeholder")).toBe("true");
    expect(getComputedStyle(day).color).toBe(tokenRgb("text-subtle"));

    await userEvent.click(group);
    await userEvent.keyboard("28022027");

    await expect.poll(() => day.getAttribute("data-placeholder")).toBeNull();
    expect(getComputedStyle(day).color).toBe(tokenRgb("text"));

    await expectNoAccessibilityViolations(screen.container);
  });

  test(`dims the separators along with the placeholder while the field holds no date in the ${variant} variant`, async () => {
    const screen = await render(<DateFieldHarness variant={variant} label="Expiry" />);
    const group = fieldGroup(screen, "Expiry");
    const separator = () => group.querySelector('[data-type="literal"]') as HTMLElement;
    expect(separator().textContent?.trim()).not.toBe("");

    // react-aria's `isPlaceholder` only applies to editable segments, never to literal ones.
    expect(getComputedStyle(separator()).color).toBe(tokenRgb("text-subtle"));

    await userEvent.click(group);
    await userEvent.keyboard("28022027");

    await expect.poll(() => getComputedStyle(separator()).color).toBe(tokenRgb("text"));

    await expectNoAccessibilityViolations(screen.container);
  });

  test(`marks which segment takes the next digit in the ${variant} variant`, async () => {
    const screen = await render(<DateFieldHarness variant={variant} label="Expiry" />);
    const group = fieldGroup(screen, "Expiry");
    const [day, month] = Array.from(group.querySelectorAll('[role="spinbutton"]')) as [
      HTMLElement,
      HTMLElement,
    ];

    await userEvent.click(day);
    await expect.poll(() => day.getAttribute("data-focused")).toBe("true");

    const focused = getComputedStyle(day);
    expect(focused.backgroundColor).not.toBe(getComputedStyle(month).backgroundColor);

    expect(
      contrastRatio(rgbToHex(focused.color), rgbToHex(focused.backgroundColor)),
    ).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);

    await expectNoAccessibilityViolations(screen.container);
  });
}

test("shows the package's own outline focus ring on the calendar button when it is keyboard-focused", async () => {
  const screen = await render(<DateFieldHarness variant="register" label="Expiry" />);

  await userEvent.tab();
  const button = screen.getByRole("button").element() as HTMLElement;
  expect(document.activeElement).toBe(button);

  await expect.poll(() => getComputedStyle(button).outlineStyle).toBe("solid");
  expect(getComputedStyle(button).outlineColor).toBe(tokenRgb("focus"));
  expect(Math.round(Number.parseFloat(getComputedStyle(button).outlineWidth))).toBe(3);
  expect(Math.round(Number.parseFloat(getComputedStyle(button).outlineOffset))).toBe(3);
});

for (const variant of ["register", "backoffice"] as const) {
  test(`gives the calendar toggle button a 24px-minimum target around its 18px glyph in the ${variant} variant`, async () => {
    const screen = await render(<DateFieldHarness variant={variant} label="Expiry" />);
    const group = fieldGroup(screen, "Expiry");
    const toggle = group.querySelector("button") as HTMLElement;
    const toggleRect = toggle.getBoundingClientRect();

    // WCAG 2.5.8 requires a 24x24 CSS px pointer target.
    expect(toggleRect.width).toBeGreaterThanOrEqual(24);
    expect(toggleRect.height).toBeGreaterThanOrEqual(24);

    const icon = toggle.querySelector("svg") as SVGSVGElement;
    expect(icon.getBoundingClientRect().width).toBeCloseTo(18, 0);
    expect(icon.getBoundingClientRect().height).toBeCloseTo(18, 0);

    const groupRect = group.getBoundingClientRect();
    expect(toggleRect.top).toBeGreaterThanOrEqual(groupRect.top);
    expect(toggleRect.bottom).toBeLessThanOrEqual(groupRect.bottom);
  });
}

const drawnGlyphInset: Record<FieldSize, number> = {
  register: 16,
  backoffice: 12,
};

for (const variant of ["register", "backoffice"] as const) {
  test(`draws the glyph at the box's own padding and the value one gap past it in the ${variant} variant`, async () => {
    const screen = await render(<DateFieldHarness variant={variant} label="Expiry" />);
    const group = fieldGroup(screen, "Expiry");
    const groupRect = group.getBoundingClientRect();
    const toggle = group.querySelector("button") as HTMLElement;
    const glyphRect = (toggle.querySelector("svg") as SVGSVGElement).getBoundingClientRect();
    const input = (group.querySelector('[role="spinbutton"]') as HTMLElement)
      .parentElement as HTMLElement;
    const inputRect = input.getBoundingClientRect();

    // The 24px target is 3px wider than the 18px glyph per side; a negative margin pulls that
    // back out of the flex layout.
    if (variant === "register") {
      expect(glyphRect.left - groupRect.left).toBeCloseTo(drawnGlyphInset[variant], 0);
      expect(inputRect.left - glyphRect.right).toBeCloseTo(8, 0);
    } else {
      expect(groupRect.right - glyphRect.right).toBeCloseTo(drawnGlyphInset[variant], 0);
      expect(glyphRect.left - inputRect.right).toBeCloseTo(8, 0);
    }

    const toggleRect = toggle.getBoundingClientRect();
    expect(toggleRect.width).toBeGreaterThanOrEqual(24);
    expect(toggleRect.height).toBeGreaterThanOrEqual(24);
  });
}

// react-aria-components portals the calendar's whole DOM into document.body, outside
// vitest-browser-react's own render container, so accessibility checks on the open calendar
// audit document.body rather than screen.container.

async function openCalendar(screen: Screen, name: string): Promise<HTMLElement> {
  const group = fieldGroup(screen, name);
  const toggle = group.querySelector("button") as HTMLElement;
  await userEvent.click(toggle);
  await expect.poll(() => screen.getByRole("dialog").elements().length).toBe(1);
  return screen.getByRole("dialog").element() as HTMLElement;
}

function calendarPanel(dialog: HTMLElement): HTMLElement {
  return dialog.parentElement as HTMLElement;
}

test("floats the calendar on the dropdown menus' surface: white, light border, 8px radius, large drop shadow, above other layers", async () => {
  const screen = await render(<DateFieldHarness variant="register" label="Expiry" />);
  const dialog = await openCalendar(screen, "Expiry");
  const panel = calendarPanel(dialog);
  const style = getComputedStyle(panel);

  expect(style.backgroundColor).toBe(tokenRgb("surface"));
  expect(style.borderRadius).toBe("8px");
  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderTopColor).toBe(tokenRgb("border"));
  expect(paintedBoxShadowLayers(panel)).toHaveLength(1);
  expect(style.boxShadow).toContain("0px 8px 24px");
  expect(style.zIndex).toBe(
    getComputedStyle(document.documentElement).getPropertyValue("--z-index-popover").trim(),
  );
  expect(paintedBoxShadowLayers(dialog)).toEqual([]);
});

test("pads the calendar 16px and stacks its header, weekdays and days 12px apart", async () => {
  const screen = await render(<DateFieldHarness variant="register" label="Expiry" />);
  const dialog = await openCalendar(screen, "Expiry");
  const style = getComputedStyle(dialog);

  expect(style.paddingTop).toBe("16px");
  expect(style.paddingLeft).toBe("16px");
  expect(style.rowGap).toBe("12px");
});

function ControlledFebruary2027() {
  const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 28));
  return <DateField label="Expiry" value={value} onChange={setValue} />;
}

function pickerTrigger(screen: Screen, name: "Mes" | "Año"): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(`${name}$`) }).element() as HTMLElement;
}

function shownHeading(dialog: HTMLElement): string {
  const titleId = dialog.getAttribute("aria-labelledby") as string;
  return (document.getElementById(titleId) as HTMLElement).textContent ?? "";
}

test("names the calendar by its month and year without a connector, with no visible heading", async () => {
  const screen = await render(<ControlledFebruary2027 />);
  const dialog = await openCalendar(screen, "Expiry");

  expect(shownHeading(dialog)).toBe("Febrero 2027");
  const title = document.getElementById(dialog.getAttribute("aria-labelledby") as string);
  const rect = (title as HTMLElement).getBoundingClientRect();
  expect(rect.width * rect.height).toBeLessThanOrEqual(1);
});

test("adds no page landmark while the calendar is open", async () => {
  const screen = await render(<ControlledFebruary2027 />);
  await openCalendar(screen, "Expiry");

  expect(screen.getByRole("banner").elements()).toEqual([]);
});

test("shows the previous and next month controls as 40px chevron buttons, each with a real accessible name", async () => {
  const screen = await render(<ControlledFebruary2027 />);
  const dialog = await openCalendar(screen, "Expiry");

  for (const slot of ["previous", "next"]) {
    const control = dialog.querySelector(`[slot="${slot}"]`) as HTMLElement;
    expect(control.getAttribute("aria-label")).toBeTruthy();
    const rect = control.getBoundingClientRect();
    expect(rect.width).toBeCloseTo(40, 0);
    expect(rect.height).toBeCloseTo(40, 0);
    expect(getComputedStyle(control).borderRadius).toBe("6px");
    expect(getComputedStyle(control).color).toBe(tokenRgb("text-subtle"));
  }
});

test("moves the calendar one month with the previous and next controls", async () => {
  const screen = await render(<ControlledFebruary2027 />);
  const dialog = await openCalendar(screen, "Expiry");

  await userEvent.click(dialog.querySelector('[slot="next"]') as HTMLElement);
  await expect.poll(() => shownHeading(dialog)).toBe("Marzo 2027");
  await userEvent.click(dialog.querySelector('[slot="previous"]') as HTMLElement);
  await userEvent.click(dialog.querySelector('[slot="previous"]') as HTMLElement);
  await expect.poll(() => shownHeading(dialog)).toBe("Enero 2027");
});

test("shows the month and the year in two pickers of bold ink values with a chevron, 40px tall, next to each other", async () => {
  const screen = await render(<ControlledFebruary2027 />);
  await openCalendar(screen, "Expiry");

  const month = pickerTrigger(screen, "Mes");
  const year = pickerTrigger(screen, "Año");
  expect(month.textContent).toBe("Febrero");
  expect(year.textContent).toBe("2027");

  for (const trigger of [month, year]) {
    const style = getComputedStyle(trigger);
    expect(trigger.getBoundingClientRect().height).toBeCloseTo(40, 0);
    expect(style.borderRadius).toBe("6px");
    expect(style.fontWeight).toBe("700");
    expect(style.color).toBe(tokenRgb("text"));
    expect(style.paddingLeft).toBe("8px");
    const chevron = trigger.querySelector("svg") as SVGSVGElement;
    expect(getComputedStyle(chevron).color).toBe(tokenRgb("text-subtle"));
  }
  const gap = year.getBoundingClientRect().left - month.getBoundingClientRect().right;
  expect(gap).toBeCloseTo(4, 0);

  await userEvent.hover(month);
  await expect.poll(() => getComputedStyle(month).backgroundColor).toBe(tokenRgb("surface-subtle"));
  await expectNoAccessibilityViolations(document.body);
});

test("lists the twelve months of the year, capitalised, and moves the calendar to the chosen one without choosing a date", async () => {
  const chosen: (CalendarDate | null)[] = [];
  function Harness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 1, 31));
    return (
      <DateField
        label="Expiry"
        value={value}
        onChange={(next) => {
          chosen.push(next);
          setValue(next);
        }}
      />
    );
  }
  const screen = await render(<Harness />);
  const dialog = await openCalendar(screen, "Expiry");

  await userEvent.click(pickerTrigger(screen, "Mes"));
  await expect.poll(() => screen.getByRole("option").elements().length).toBe(12);
  const names = screen
    .getByRole("option")
    .elements()
    .map((option) => option.textContent);
  expect(names).toEqual([
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ]);
  await expectNoAccessibilityViolations(document.body);

  await userEvent.click(screen.getByRole("option", { name: "Febrero" }));
  await expect.poll(() => shownHeading(dialog)).toBe("Febrero 2027");
  expect(pickerTrigger(screen, "Mes").textContent).toBe("Febrero");
  expect(chosen).toEqual([]);
});

test("reaches a date years away in two choices with the year picker and the month picker", async () => {
  const screen = await render(<ControlledFebruary2027 />);
  const dialog = await openCalendar(screen, "Expiry");

  await userEvent.click(pickerTrigger(screen, "Año"));
  await userEvent.click(screen.getByRole("option", { name: "2019" }));
  await expect.poll(() => shownHeading(dialog)).toBe("Febrero 2019");
  await userEvent.click(pickerTrigger(screen, "Mes"));
  await userEvent.click(screen.getByRole("option", { name: "Septiembre" }));
  await expect.poll(() => shownHeading(dialog)).toBe("Septiembre 2019");

  const days = Array.from(dialog.querySelectorAll("td [role='button']")) as HTMLElement[];
  await userEvent.click(days.find((cell) => cell.textContent?.trim() === "15") as HTMLElement);
  await expect
    .poll(() => segmentsOf(fieldGroup(screen, "Expiry")).map((segment) => segment.textContent))
    .toEqual(["15", "9", "2019"]);
});

test("lists a hundred years either side of the shown year when the field has no range, marking the shown one", async () => {
  const screen = await render(<ControlledFebruary2027 />);
  await openCalendar(screen, "Expiry");

  await userEvent.click(pickerTrigger(screen, "Año"));
  const options = screen.getByRole("option").elements() as HTMLElement[];
  expect(options).toHaveLength(201);
  expect(options[0]?.textContent).toBe("1927");
  expect(options[200]?.textContent).toBe("2127");
  const selected = options.filter((option) => option.getAttribute("aria-selected") === "true");
  expect(selected.map((option) => option.textContent)).toEqual(["2027"]);
  expect(getComputedStyle(selected[0] as HTMLElement).backgroundColor).toBe(
    tokenRgb("action-subtle"),
  );
});

test("offers only the years of the allowed range and disables the months outside it", async () => {
  function Harness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 3, 15));
    return (
      <DateField
        label="Expiry"
        value={value}
        onChange={setValue}
        minValue={new CalendarDate(2027, 2, 10)}
        maxValue={new CalendarDate(2027, 4, 20)}
        rangeMessage="The date must be between 10/02/2027 and 20/04/2027."
      />
    );
  }
  const screen = await render(<Harness />);
  const dialog = await openCalendar(screen, "Expiry");

  await userEvent.click(pickerTrigger(screen, "Mes"));
  const months = screen.getByRole("option").elements() as HTMLElement[];
  const enabled = months
    .filter((option) => option.getAttribute("aria-disabled") !== "true")
    .map((option) => option.textContent);
  expect(enabled).toEqual(["Febrero", "Marzo", "Abril"]);
  await userEvent.click(screen.getByRole("option", { name: "Abril" }));
  await expect.poll(() => shownHeading(dialog)).toBe("Abril 2027");

  await userEvent.click(pickerTrigger(screen, "Año"));
  expect(
    screen
      .getByRole("option")
      .elements()
      .map((option) => option.textContent),
  ).toEqual(["2027"]);
});

test("limits the year picker to the years between the range's bounds", async () => {
  function Harness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 3, 15));
    return (
      <DateField
        label="Expiry"
        value={value}
        onChange={setValue}
        minValue={new CalendarDate(2025, 6, 1)}
        maxValue={new CalendarDate(2028, 1, 31)}
        rangeMessage="The date must be between 01/06/2025 and 31/01/2028."
      />
    );
  }
  const screen = await render(<Harness />);
  await openCalendar(screen, "Expiry");

  await userEvent.click(pickerTrigger(screen, "Año"));
  expect(
    screen
      .getByRole("option")
      .elements()
      .map((option) => option.textContent),
  ).toEqual(["2025", "2026", "2027", "2028"]);
  await userEvent.click(screen.getByRole("option", { name: "2028" }));
  await userEvent.click(pickerTrigger(screen, "Mes"));
  const enabled = (screen.getByRole("option").elements() as HTMLElement[])
    .filter((option) => option.getAttribute("aria-disabled") !== "true")
    .map((option) => option.textContent);
  expect(enabled).toEqual(["Enero"]);
});

test("draws the calendar's weekday initials bold in the package's own supporting tone and scale", async () => {
  const screen = await render(<DateFieldHarness variant="register" label="Expiry" />);
  const dialog = await openCalendar(screen, "Expiry");

  const weekdays = Array.from(dialog.querySelectorAll("th")) as HTMLElement[];
  expect(weekdays).toHaveLength(7);

  for (const weekday of weekdays) {
    expect(weekday.textContent?.trim()).not.toBe("");
    const style = getComputedStyle(weekday);
    expect(Math.round(Number.parseFloat(style.fontSize))).toBe(14);
    expect(style.fontWeight).toBe("700");
    expect(style.color).toBe(tokenRgb("text-subtle"));
    expect(
      contrastRatio(
        rgbToHex(style.color),
        rgbToHex(getComputedStyle(calendarPanel(dialog)).backgroundColor),
      ),
    ).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
  }

  await expectNoAccessibilityViolations(document.body);
});

test("dims the calendar's month controls once the allowed range reaches no further month", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 15));
    return (
      <DateField
        label="Expiry"
        value={value}
        onChange={setValue}
        minValue={new CalendarDate(2027, 2, 1)}
        maxValue={new CalendarDate(2027, 2, 28)}
        rangeMessage="The date must be in February 2027."
      />
    );
  }
  const screen = await render(<ControlledHarness />);
  await openCalendar(screen, "Expiry");

  const previous = document.body.querySelector('[slot="previous"]') as HTMLElement;
  const next = document.body.querySelector('[slot="next"]') as HTMLElement;

  expect(previous.getAttribute("data-disabled")).toBe("true");
  expect(next.getAttribute("data-disabled")).toBe("true");
  expect(getComputedStyle(previous).opacity).toBe("0.45");
  expect(getComputedStyle(next).opacity).toBe("0.45");
  expect(getComputedStyle(previous).cursor).toBe("default");
  expect(getComputedStyle(next).cursor).toBe("default");

  await userEvent.hover(previous);
  expect(getComputedStyle(previous).backgroundColor).not.toBe(tokenRgb("surface-subtle"));
});

test("shows the hand cursor on the calendar's month controls while the range still reaches further", async () => {
  const screen = await render(<DateFieldHarness variant="register" label="Expiry" />);
  const dialog = await openCalendar(screen, "Expiry");

  const previous = dialog.querySelector('[slot="previous"]') as HTMLElement;
  const next = dialog.querySelector('[slot="next"]') as HTMLElement;

  expect(getComputedStyle(previous).cursor).toBe("pointer");
  expect(getComputedStyle(next).cursor).toBe("pointer");

  await expectNoAccessibilityViolations(document.body);
});

test("shows the chosen day with a blue UI fill and a white number, clearing the AA text contrast minimum", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 28));
    return <DateField label="Expiry" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const dialog = await openCalendar(screen, "Expiry");

  const chosen = dialog.querySelector('[data-selected="true"]') as HTMLElement;
  expect(chosen.textContent?.trim()).toBe("28");
  const style = getComputedStyle(chosen);
  expect(style.backgroundColor).toBe(tokenRgb("action"));
  expect(style.color).toBe(tokenRgb("text-inverse"));

  const fillHex = rgbToHex(style.backgroundColor);
  const textHex = rgbToHex(style.color);
  expect(contrastRatio(textHex, fillHex)).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
});

test("shows an unchosen day in ink that turns bone on hover", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 28));
    return <DateField label="Expiry" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const dialog = await openCalendar(screen, "Expiry");

  const cells = Array.from(dialog.querySelectorAll("td [role='button']")) as HTMLElement[];
  const unchosen = cells.find((cell) => cell.textContent?.trim() === "15") as HTMLElement;
  expect(getComputedStyle(unchosen).color).toBe(tokenRgb("text"));

  await userEvent.hover(unchosen);
  await expect
    .poll(() => getComputedStyle(unchosen).backgroundColor)
    .toBe(tokenRgb("surface-subtle"));
});

test("shows the hand cursor on a selectable day and the arrow on a day outside the allowed range", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 15));
    return (
      <DateField
        label="Expiry"
        value={value}
        onChange={setValue}
        minValue={new CalendarDate(2027, 2, 10)}
        maxValue={new CalendarDate(2027, 2, 20)}
        rangeMessage="The date must be between 10/02/2027 and 20/02/2027."
      />
    );
  }
  const screen = await render(<ControlledHarness />);
  const dialog = await openCalendar(screen, "Expiry");

  const cells = Array.from(dialog.querySelectorAll("td [role='button']")) as HTMLElement[];
  const selectable = cells.find((cell) => cell.textContent?.trim() === "15") as HTMLElement;
  const outOfRange = cells.find((cell) => cell.textContent?.trim() === "5") as HTMLElement;

  expect(getComputedStyle(selectable).cursor).toBe("pointer");
  expect(getComputedStyle(outOfRange).cursor).toBe("default");
  expect(getComputedStyle(outOfRange).opacity).toBe("0.45");
  expect(getComputedStyle(selectable).opacity).toBe("1");
});

test("shows the package's own outline focus ring on the focused day", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 28));
    return <DateField label="Expiry" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const group = fieldGroup(screen, "Expiry");
  const toggle = group.querySelector("button") as HTMLElement;

  // react-aria only shows the focus-visible ring when the input modality is "keyboard", which a
  // real click on the toggle would not set.
  toggle.focus();
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => screen.getByRole("dialog").elements().length).toBe(1);
  const dialog = screen.getByRole("dialog").element() as HTMLElement;

  const focused = dialog.querySelector('[data-focus-visible="true"]') as HTMLElement;
  expect(focused, "no keyboard-focused day cell found once the calendar opened").not.toBeNull();
  const style = getComputedStyle(focused);
  expect(style.outlineStyle).toBe("solid");
  expect(style.outlineColor).toBe(tokenRgb("focus"));
  expect(Math.round(Number.parseFloat(style.outlineOffset))).toBe(2);
});

test("keeps the focused day's outline ring inside the calendar panel", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 15));
    return <DateField label="Expiry" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const group = fieldGroup(screen, "Expiry");
  const toggle = group.querySelector("button") as HTMLElement;

  toggle.focus();
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => screen.getByRole("dialog").elements().length).toBe(1);
  const dialog = screen.getByRole("dialog").element() as HTMLElement;

  const focused = dialog.querySelector('[data-focus-visible="true"]') as HTMLElement;
  const outlineWidth = Number.parseFloat(getComputedStyle(focused).outlineWidth);
  const outlineOffset = Number.parseFloat(getComputedStyle(focused).outlineOffset);
  const ringExtent = outlineWidth + outlineOffset;

  const cellRect = focused.getBoundingClientRect();
  const panelRect = dialog.getBoundingClientRect();
  const ringRect = {
    left: cellRect.left - ringExtent,
    right: cellRect.right + ringExtent,
    top: cellRect.top - ringExtent,
    bottom: cellRect.bottom + ringExtent,
  };

  expect(ringRect.left, "ring clipped by the panel's left edge").toBeGreaterThanOrEqual(
    panelRect.left,
  );
  expect(ringRect.right, "ring clipped by the panel's right edge").toBeLessThanOrEqual(
    panelRect.right,
  );
  expect(ringRect.top, "ring clipped by the panel's top edge").toBeGreaterThanOrEqual(
    panelRect.top,
  );
  expect(ringRect.bottom, "ring clipped by the panel's bottom edge").toBeLessThanOrEqual(
    panelRect.bottom,
  );

  await expectNoAccessibilityViolations(document.body);
});

test("spaces adjacent day cells 4px apart, horizontally and vertically", async () => {
  const screen = await render(<ControlledFebruary2027 />);
  const dialog = await openCalendar(screen, "Expiry");

  const cell = dialog.querySelector("td") as HTMLElement;
  const row = cell.parentElement as HTMLElement;
  const rightNeighbour = row.children[1] as HTMLElement;
  expect(
    rightNeighbour.getBoundingClientRect().left - cell.getBoundingClientRect().right,
  ).toBeCloseTo(4, 0);

  const belowNeighbour = (row.nextElementSibling as HTMLElement).children[0] as HTMLElement;
  expect(
    belowNeighbour.getBoundingClientRect().top - cell.getBoundingClientRect().bottom,
  ).toBeCloseTo(4, 0);
});

test("draws each day as a 40px rounded square with its number in body scale", async () => {
  const screen = await render(<ControlledFebruary2027 />);
  const dialog = await openCalendar(screen, "Expiry");

  const days = Array.from(dialog.querySelectorAll("td [role='button']")) as HTMLElement[];
  const day = days.find((cell) => cell.textContent?.trim() === "15") as HTMLElement;
  const rect = day.getBoundingClientRect();
  expect(rect.width).toBeCloseTo(40, 0);
  expect(rect.height).toBeCloseTo(40, 0);
  expect(getComputedStyle(day).borderRadius).toBe("6px");
  expect(Math.round(Number.parseFloat(getComputedStyle(day).fontSize))).toBe(16);
});

test("shows the chosen day in bold", async () => {
  const screen = await render(<ControlledFebruary2027 />);
  const dialog = await openCalendar(screen, "Expiry");

  const chosen = dialog.querySelector('[data-selected="true"]') as HTMLElement;
  expect(getComputedStyle(chosen).fontWeight).toBe("700");
});

afterEach(() => {
  vi.useRealTimers();
});

test("rings today in brand blue and bolds its number, leaving other days plain", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2027-02-10T12:00:00Z"));
  const screen = await render(<ControlledFebruary2027 />);
  const dialog = await openCalendar(screen, "Expiry");

  const marked = Array.from(dialog.querySelectorAll("[data-today]")) as HTMLElement[];
  expect(marked.map((cell) => cell.textContent?.trim())).toEqual(["10"]);
  const todayCell = marked[0] as HTMLElement;
  expect(getComputedStyle(todayCell).fontWeight).toBe("700");
  expect(paintedBoxShadowLayers(todayCell)).toEqual([insetBoundary("action", "2px")]);
  expect(getComputedStyle(todayCell).backgroundColor).not.toBe(tokenRgb("action"));

  const days = Array.from(dialog.querySelectorAll("td [role='button']")) as HTMLElement[];
  const other = days.find((cell) => cell.textContent?.trim() === "11") as HTMLElement;
  expect(paintedBoxShadowLayers(other)).toEqual([]);
  expect(getComputedStyle(other).fontWeight).toBe("400");
});

test("keeps today's number legible when today is also the chosen day", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2027-02-28T12:00:00Z"));
  const screen = await render(<ControlledFebruary2027 />);
  const dialog = await openCalendar(screen, "Expiry");

  const todayCell = dialog.querySelector("[data-today]") as HTMLElement;
  const style = getComputedStyle(todayCell);
  expect(style.backgroundColor).toBe(tokenRgb("action"));
  expect(style.color).toBe(tokenRgb("text-inverse"));
  expect(style.fontWeight).toBe("700");
});

async function openCalendarWithKeyboard(screen: Screen, name: string): Promise<HTMLElement> {
  const group = fieldGroup(screen, name);
  const toggle = group.querySelector("button") as HTMLElement;
  toggle.focus();
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => screen.getByRole("dialog").elements().length).toBe(1);
  return screen.getByRole("dialog").element() as HTMLElement;
}

function focusedDayLabel(dialog: HTMLElement): string {
  const focused = dialog.querySelector('[data-focus-visible="true"]') as HTMLElement;
  return focused.textContent?.trim() ?? "";
}

test("moves the focused day by one with the arrow keys, wrapping into the neighbouring month", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 1));
    return <DateField label="Expiry" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const dialog = await openCalendarWithKeyboard(screen, "Expiry");

  expect(focusedDayLabel(dialog)).toBe("1");

  await userEvent.keyboard("{ArrowLeft}");
  await expect
    .poll(() => dialog.querySelector("h2")?.textContent?.toLowerCase())
    .toContain("enero");
  expect(focusedDayLabel(dialog)).toBe("31");

  await userEvent.keyboard("{ArrowRight}");
  await expect
    .poll(() => dialog.querySelector("h2")?.textContent?.toLowerCase())
    .toContain("febrero");
  expect(focusedDayLabel(dialog)).toBe("1");

  await userEvent.keyboard("{ArrowDown}");
  expect(focusedDayLabel(dialog)).toBe("8");

  await userEvent.keyboard("{ArrowUp}");
  expect(focusedDayLabel(dialog)).toBe("1");

  await expectNoAccessibilityViolations(document.body);
});

test("chooses the focused day and closes the calendar with Enter", async () => {
  const screen = await render(<CallerValueHarness variant="register" label="Expiry" />);
  const dialog = await openCalendarWithKeyboard(screen, "Expiry");
  const focusedLabel = focusedDayLabel(dialog);

  await userEvent.keyboard("{Enter}");

  await expect.poll(() => screen.getByRole("dialog").elements().length).toBe(0);
  const today = new Date();
  const expectedIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${focusedLabel.padStart(2, "0")}`;
  await expect
    .poll(() => screen.getByTestId("caller-value").element().textContent)
    .toBe(expectedIso);

  await expectNoAccessibilityViolations(screen.container);
});

test("chooses the focused day and closes the calendar with Space", async () => {
  const screen = await render(<CallerValueHarness variant="register" label="Expiry" />);
  await openCalendarWithKeyboard(screen, "Expiry");

  await userEvent.keyboard(" ");

  await expect.poll(() => screen.getByRole("dialog").elements().length).toBe(0);
  await expect.poll(() => screen.getByTestId("caller-value").element().textContent).not.toBe("");

  await expectNoAccessibilityViolations(screen.container);
});

test("closes the calendar without changing the field when Escape is pressed", async () => {
  const screen = await render(<CallerValueHarness variant="register" label="Expiry" />);
  await openCalendarWithKeyboard(screen, "Expiry");

  await userEvent.keyboard("{Escape}");

  await expect.poll(() => screen.getByRole("dialog").elements().length).toBe(0);
  expect(screen.getByTestId("caller-value").element().textContent).toBe("");

  await expectNoAccessibilityViolations(screen.container);
});

test("clicking a day with the mouse chooses it, updates the typed value and closes the calendar", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 1));
    return (
      <>
        <DateField label="Expiry" value={value} onChange={setValue} />
        <p data-testid="caller-value">{value?.toString() ?? ""}</p>
      </>
    );
  }
  const screen = await render(<ControlledHarness />);
  const dialog = await openCalendar(screen, "Expiry");

  const cells = Array.from(dialog.querySelectorAll("td [role='button']")) as HTMLElement[];
  const target = cells.find((cell) => cell.textContent?.trim() === "15") as HTMLElement;
  await userEvent.click(target);

  await expect.poll(() => screen.getByRole("dialog").elements().length).toBe(0);
  await expect
    .poll(() => screen.getByTestId("caller-value").element().textContent)
    .toBe("2027-02-15");

  const group = fieldGroup(screen, "Expiry");
  expect(group.textContent).toContain("15");

  await expectNoAccessibilityViolations(screen.container);
});

test("updates the calendar's chosen day once typing finishes a complete valid date", async () => {
  const screen = await render(<CallerValueHarness variant="register" label="Expiry" />);
  const group = fieldGroup(screen, "Expiry");

  await userEvent.click(group);
  await userEvent.keyboard("28022027");
  await expect
    .poll(() => screen.getByTestId("caller-value").element().textContent)
    .toBe("2027-02-28");

  const dialog = await openCalendar(screen, "Expiry");
  const chosen = dialog.querySelector('[data-selected="true"]') as HTMLElement;
  expect(chosen.textContent?.trim()).toBe("28");
});

test("refuses a date outside the caller's allowed range, showing its message under the field in error UI", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 3, 15));
    return (
      <DateField
        label="Expiry"
        value={value}
        onChange={setValue}
        minValue={new CalendarDate(2027, 1, 1)}
        maxValue={new CalendarDate(2027, 2, 28)}
        rangeMessage="The date must be 28/02/2027 or earlier."
      />
    );
  }
  const screen = await render(<ControlledHarness />);
  const group = fieldGroup(screen, "Expiry");

  expect(paintedBoxShadowLayers(group)).toEqual([insetBoundary("error", "2px")]);
  const message = screen.getByText("The date must be 28/02/2027 or earlier.");
  await expect.element(message).toBeVisible();
  expect(getComputedStyle(message.element()).color).toBe(tokenRgb("error"));
});

test("does not select the out-of-range day in the calendar", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 3, 15));
    return (
      <DateField
        label="Expiry"
        value={value}
        onChange={setValue}
        minValue={new CalendarDate(2027, 1, 1)}
        maxValue={new CalendarDate(2027, 2, 28)}
        rangeMessage="The date must be 28/02/2027 or earlier."
      />
    );
  }
  const screen = await render(<ControlledHarness />);
  const dialog = await openCalendar(screen, "Expiry");

  expect(dialog.querySelector('[data-selected="true"]')).toBeNull();

  await expectNoAccessibilityViolations(document.body);
});

function BoundedHarness({ value }: { value: CalendarDate }) {
  const [current, setCurrent] = useState<CalendarDate | null>(value);
  return (
    <DateField
      label="Expiry"
      value={current}
      onChange={setCurrent}
      minValue={RANGE_MIN}
      maxValue={RANGE_MAX}
      rangeMessage={RANGE_MESSAGE}
      description={RANGE_HELPER}
    />
  );
}

for (const [edge, accepted] of [
  ["the first day the range allows", RANGE_MIN],
  ["the last day the range allows", RANGE_MAX],
  ["a day between the two days the range names", new CalendarDate(2027, 2, 10)],
] as const) {
  test(`accepts ${edge}, keeping the resting box and the helper line`, async () => {
    const screen = await render(<BoundedHarness value={accepted} />);
    const group = fieldGroup(screen, "Expiry");

    expect(paintedBoxShadowLayers(group)).toEqual([insetBoundary("border", "2px")]);
    expect(screen.getByText(RANGE_MESSAGE).elements()).toHaveLength(0);
    await expect.element(screen.getByText(RANGE_HELPER)).toBeVisible();

    await expectNoAccessibilityViolations(screen.container);
  });
}

test("still tells the caller a date typed outside the allowed range, while drawing the field as refused", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(null);
    return (
      <>
        <DateField
          label="Expiry"
          value={value}
          onChange={setValue}
          minValue={RANGE_MIN}
          maxValue={RANGE_MAX}
          rangeMessage={RANGE_MESSAGE}
        />
        <p data-testid="caller-value">{value?.toString() ?? ""}</p>
      </>
    );
  }
  const screen = await render(<ControlledHarness />);
  const group = fieldGroup(screen, "Expiry");

  await userEvent.click(group);
  await userEvent.keyboard("15032027");

  await expect
    .poll(() => screen.getByTestId("caller-value").element().textContent)
    .toBe("2027-03-15");

  await expect.element(screen.getByText(RANGE_MESSAGE)).toBeVisible();

  (document.activeElement as HTMLElement).blur();
  await expect
    .poll(() => getComputedStyle(group).boxShadow)
    .toContain(insetBoundary("error", "2px"));

  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept an allowed range without the message the field shows outside it", () => {
  expectTypeOf<{
    label: string;
    value: CalendarDate | null;
    onChange: (value: CalendarDate | null) => void;
    minValue: CalendarDate;
  }>().not.toExtend<DateFieldProps>();
  expectTypeOf<{
    label: string;
    value: CalendarDate | null;
    onChange: (value: CalendarDate | null) => void;
    maxValue: CalendarDate;
  }>().not.toExtend<DateFieldProps>();
});

test("accepts a field with no range at all, and separately with a range and its message", () => {
  expectTypeOf<{
    label: string;
    value: CalendarDate | null;
    onChange: (value: CalendarDate | null) => void;
  }>().toExtend<DateFieldProps>();
  expectTypeOf<{
    label: string;
    value: CalendarDate | null;
    onChange: (value: CalendarDate | null) => void;
    minValue: CalendarDate;
    maxValue: CalendarDate;
    rangeMessage: string;
  }>().toExtend<DateFieldProps>();
});

test("does not accept a date, a lower bound or an upper bound written as text", () => {
  expectTypeOf<{
    label: string;
    value: string;
    onChange: (value: string) => void;
  }>().not.toExtend<DateFieldProps>();
  expectTypeOf<{
    label: string;
    value: CalendarDate | null;
    onChange: (value: CalendarDate | null) => void;
    minValue: string;
    maxValue: string;
    rangeMessage: string;
  }>().not.toExtend<DateFieldProps>();
});

test("does not accept a field without a label, a value or onChange", () => {
  expectTypeOf<{
    value: CalendarDate | null;
    onChange: (value: CalendarDate | null) => void;
  }>().not.toExtend<DateFieldProps>();
  expectTypeOf<{
    label: string;
    onChange: (value: CalendarDate | null) => void;
  }>().not.toExtend<DateFieldProps>();
  expectTypeOf<{
    label: string;
    value: CalendarDate | null;
  }>().not.toExtend<DateFieldProps>();
});

test("holds a day the calendar system itself constrains, with no text left for the field to parse", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 30));
    return <DateField label="Expiry" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const group = fieldGroup(screen, "Expiry");

  expect(group.textContent).toContain("28");
  expect(group.textContent).toContain("02");
  expect(group.textContent).toContain("2027");
});

test("announces the field with its label and current value through its segments", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 28));
    return <DateField label="Expiry" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const group = fieldGroup(screen, "Expiry");
  expect(group.getAttribute("aria-label") ?? group.getAttribute("aria-labelledby")).toBeTruthy();

  const segments = Array.from(group.querySelectorAll('[role="spinbutton"]')) as HTMLElement[];
  const valueTexts = segments.map((segment) => segment.getAttribute("aria-valuetext") ?? "");

  expect(valueTexts.some((text) => text.includes("28"))).toBe(true);
  expect(valueTexts.some((text) => text.toLowerCase().includes("febrero"))).toBe(true);
  expect(valueTexts.some((text) => text.includes("2027"))).toBe(true);
});

test("announces the open calendar as a dialog named by the month and year it shows", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 28));
    return <DateField label="Expiry" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  await openCalendar(screen, "Expiry");

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog).toBeVisible();
  const accessibleName = (dialog.element() as HTMLElement).getAttribute("aria-label") ?? "";
  const labelledBy = (dialog.element() as HTMLElement).getAttribute("aria-labelledby");
  const composedName = labelledBy
    ? (labelledBy
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ") ?? "")
    : accessibleName;

  expect(composedName).toBe("Febrero 2027");
});

test("announces the chosen day's button as selected", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 28));
    return <DateField label="Expiry" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const dialog = await openCalendar(screen, "Expiry");

  const chosen = dialog.querySelector('[data-selected="true"]') as HTMLElement;
  expect(chosen.closest("td")?.getAttribute("aria-selected")).toBe("true");
});

function segmentsOf(group: HTMLElement): HTMLElement[] {
  return Array.from(group.querySelectorAll('[role="spinbutton"]')) as HTMLElement[];
}

function describedTextOf(element: HTMLElement): string {
  return (element.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter((id) => id !== "")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

for (const variant of ["register", "backoffice"] as const) {
  test(`replaces the helper line with the caller's message and exposes the field as invalid, described by that message, in the ${variant} variant`, async () => {
    const field = (
      <DateField
        label="Start"
        value={null}
        onChange={() => {}}
        description="Should not be visible."
        errorMessage="Choose a start date."
      />
    );
    const screen = await render(
      variant === "backoffice" ? (
        <FieldSizeProvider size="backoffice">{field}</FieldSizeProvider>
      ) : (
        field
      ),
    );
    const group = fieldGroup(screen, "Start");

    expect(paintedBoxShadowLayers(group)).toEqual([insetBoundary("error", "2px")]);
    const message = screen.getByText("Choose a start date.");
    await expect.element(message).toBeVisible();
    expect(getComputedStyle(message.element()).color).toBe(tokenRgb("error"));
    expect(screen.getByText("Should not be visible.").query()).toBeNull();
    for (const segment of segmentsOf(group)) {
      expect(segment.getAttribute("aria-invalid")).toBe("true");
      expect(describedTextOf(segment)).toContain("Choose a start date.");
    }

    await expectNoAccessibilityViolations(screen.container);
  });
}

function DateFieldWithSharedErrorMessage() {
  const errorId = useId();
  return (
    <>
      <DateField
        label="Start"
        value={null}
        onChange={() => {}}
        description="Should not be visible."
        errorMessageId={errorId}
      />
      <p id={errorId}>Shared by another field.</p>
    </>
  );
}

test("exposes the field as invalid, described by a shared message rendered outside it through errorMessageId", async () => {
  const screen = await render(<DateFieldWithSharedErrorMessage />);
  const group = fieldGroup(screen, "Start");

  expect(paintedBoxShadowLayers(group)).toEqual([insetBoundary("error", "2px")]);
  expect(screen.getByText("Should not be visible.").query()).toBeNull();
  for (const segment of segmentsOf(group)) {
    expect(segment.getAttribute("aria-invalid")).toBe("true");
    expect(describedTextOf(segment)).toContain("Shared by another field.");
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("exposes a field without an error message as valid, described by nothing", async () => {
  const screen = await render(<DateField label="Start" value={null} onChange={() => {}} />);
  const group = fieldGroup(screen, "Start");

  expect(paintedBoxShadowLayers(group)).toEqual([insetBoundary("border", "2px")]);
  for (const segment of segmentsOf(group)) {
    expect(segment.getAttribute("aria-invalid")).not.toBe("true");
    expect(describedTextOf(segment)).toBe("");
  }
});

test("shows the caller's message instead of the range message when both apply", async () => {
  const screen = await render(
    <DateField
      label="Start"
      value={new CalendarDate(2027, 3, 15)}
      onChange={() => {}}
      maxValue={RANGE_MAX}
      rangeMessage={RANGE_MESSAGE}
      errorMessage="The date cannot be in the future."
    />,
  );

  await expect.element(screen.getByText("The date cannot be in the future.")).toBeVisible();
  expect(screen.getByText(RANGE_MESSAGE).query()).toBeNull();

  await expectNoAccessibilityViolations(screen.container);
});

test("marks a required field with an asterisk and exposes it as required", async () => {
  const screen = await render(
    <DateField label="Start" value={null} onChange={() => {}} required />,
  );
  const label = screen.getByText("Start").element() as HTMLElement;
  // A CSS-generated ::after asterisk still folds into the group's accessible name.
  const group = screen.getByRole("group", { name: /^Start/ }).element() as HTMLElement;

  expect(getComputedStyle(label, "::after").content).toContain("*");
  for (const segment of segmentsOf(group)) {
    expect(segment.getAttribute("aria-required")).toBe("true");
  }
});

test("has no invalid prop, since an error message or a shared error message id makes the field invalid", () => {
  expectTypeOf<DateFieldProps>().not.toHaveProperty("invalid");
});

test("does not accept both its own message and a shared one", () => {
  expectTypeOf<{
    label: string;
    value: CalendarDate | null;
    onChange: (value: CalendarDate | null) => void;
    errorMessage: string;
    errorMessageId: string;
  }>().not.toExtend<DateFieldProps>();
});

test("accepts an error message, a shared error message id, or neither", () => {
  expectTypeOf<{
    label: string;
    value: CalendarDate | null;
    onChange: (value: CalendarDate | null) => void;
    errorMessage: string | undefined;
    required: true;
  }>().toExtend<DateFieldProps>();
  expectTypeOf<{
    label: string;
    value: CalendarDate | null;
    onChange: (value: CalendarDate | null) => void;
    errorMessageId: string;
  }>().toExtend<DateFieldProps>();
});

test("does not name its secondary text helperText", () => {
  expectTypeOf<DateFieldProps>().not.toHaveProperty("helperText");
});
