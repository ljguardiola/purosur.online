import { CalendarDate } from "@internationalized/date";
import { useState } from "react";
import { beforeEach, expect, expectTypeOf, test } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { AA_TEXT_CONTRAST, contrastRatio, NON_TEXT_CONTRAST } from "../styles/contrast";
import { expectNoAccessibilityViolations } from "../test/axe";
import type { DispatchableCdpSession } from "../test/setup-browser";
import {
  boundaryColorHex,
  insetBoundary,
  paintedBoxShadowLayers,
  rgbToHex,
  tokenRgb,
} from "../test/token-colors";
import { DateField, type DateFieldProps } from "./DateField";

type Screen = Awaited<ReturnType<typeof render>>;

function fieldGroup(screen: Screen, name: string): HTMLElement {
  return screen.getByRole("group", { name }).element() as HTMLElement;
}

// This package targets desktop POS displays; the default browser-mode viewport is phone-sized,
// which would leave no room for the calendar panel below the field. Also gives React Aria a real
// pointer move before the first hover-driven assertion, the same way Tooltip.test.tsx does.
beforeEach(async () => {
  await page.viewport(1280, 900);
  const session = cdp() as unknown as DispatchableCdpSession;
  await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
});

// Narrowed to the no-range shape rather than `Omit<DateFieldProps, "value" | "onChange">`:
// DateFieldRangeProps is a union with no common discriminant field, so Omit would collapse it
// into a shape TypeScript can no longer match back to a single member under
// `exactOptionalPropertyTypes`. Every call site below only ever renders the field without a
// range, so this is also the accurate type for what they actually pass.
type NoRangeHarnessProps = {
  variant: DateFieldProps["variant"];
  label: string;
  helperText?: string;
  disabled?: boolean;
};

function DateFieldHarness(props: NoRangeHarnessProps) {
  const [value, setValue] = useState<CalendarDate | null>(null);
  return <DateField {...props} value={value} onChange={setValue} />;
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
  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));

  const icon = group.querySelector("svg") as SVGSVGElement;
  const iconRect = icon.getBoundingClientRect();
  expect(iconRect.width).toBeCloseTo(18, 0);
  expect(iconRect.height).toBeCloseTo(18, 0);
  // The icon leads the value in the register variant: it is the group's first element.
  expect(group.firstElementChild?.contains(icon)).toBe(true);

  const label = screen.getByText("Expiry").element() as HTMLElement;
  expect(getComputedStyle(label).fontWeight).toBe("700");
  expect(Math.round(Number.parseFloat(getComputedStyle(label).fontSize))).toBe(16);
  expect(getComputedStyle(label).color).toBe(tokenRgb("ink"));

  await expectNoAccessibilityViolations(screen.container);
});

test("renders the backoffice variant at 48px with 12px padding and a trailing icon", async () => {
  const screen = await render(<DateFieldHarness variant="backoffice" label="Date" />);
  const group = fieldGroup(screen, "Date");
  const style = getComputedStyle(group);
  const rect = group.getBoundingClientRect();

  expect(rect.height).toBeCloseTo(48, 0);
  expect(style.borderRadius).toBe("8px");
  expect(Math.round(Number.parseFloat(style.paddingLeft))).toBe(12);
  expect(Math.round(Number.parseFloat(style.paddingRight))).toBe(12);

  const icon = group.querySelector("svg") as SVGSVGElement;
  const iconRect = icon.getBoundingClientRect();
  expect(iconRect.width).toBeCloseTo(18, 0);
  expect(iconRect.height).toBeCloseTo(18, 0);
  // The icon trails the value in the backoffice variant: it is the group's last element.
  expect(group.lastElementChild?.contains(icon)).toBe(true);

  const label = screen.getByText("Date").element() as HTMLElement;
  expect(getComputedStyle(label).fontWeight).toBe("700");
  expect(Math.round(Number.parseFloat(getComputedStyle(label).fontSize))).toBe(14);
  expect(getComputedStyle(label).color).toBe(tokenRgb("ink-secondary"));

  await expectNoAccessibilityViolations(screen.container);
});

test("shows the helper line under the register field when supplied", async () => {
  const screen = await render(
    <DateFieldHarness
      variant="register"
      label="Expiry"
      helperText="A different expiry for the same product is entered as a separate line."
    />,
  );

  const helper = screen.getByText(
    "A different expiry for the same product is entered as a separate line.",
  );
  await expect.element(helper).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the label 6px above the register field's box", async () => {
  const screen = await render(<DateFieldHarness variant="register" label="Expiry" />);
  const wrapper = fieldGroup(screen, "Expiry").parentElement as HTMLElement;

  expect(Math.round(Number.parseFloat(getComputedStyle(wrapper).rowGap))).toBe(6);

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the label 4px above the backoffice field's box", async () => {
  const screen = await render(<DateFieldHarness variant="backoffice" label="Date" />);
  const wrapper = fieldGroup(screen, "Date").parentElement as HTMLElement;

  expect(Math.round(Number.parseFloat(getComputedStyle(wrapper).rowGap))).toBe(4);

  await expectNoAccessibilityViolations(screen.container);
});

for (const variant of ["register", "backoffice"] as const) {
  test(`shows a white box with a 2px line border at rest in the ${variant} variant`, async () => {
    const screen = await render(<DateFieldHarness variant={variant} label="Expiry" />);
    const group = fieldGroup(screen, "Expiry");
    const style = getComputedStyle(group);

    expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
    expect(paintedBoxShadowLayers(group)).toEqual([insetBoundary("line", "2px")]);

    await expectNoAccessibilityViolations(screen.container);
  });

  test(`turns the box bone on hover in the ${variant} variant, keeping the same 2px line border`, async () => {
    const screen = await render(<DateFieldHarness variant={variant} label="Expiry" />);
    const group = fieldGroup(screen, "Expiry");

    await userEvent.hover(group);
    await expect.poll(() => getComputedStyle(group).backgroundColor).toBe(tokenRgb("surface-bone"));
    expect(paintedBoxShadowLayers(group)).toEqual([insetBoundary("line", "2px")]);

    await expectNoAccessibilityViolations(screen.container);
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
    expect(getComputedStyle(group).backgroundColor).toBe(tokenRgb("surface-white"));
    expect(paintedBoxShadowLayers(group)).toEqual([insetBoundary("line", "2px")]);

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
      helperText="A different expiry for the same product is entered as a separate line."
      disabled
    />,
  );

  // Dimmed by the field's own 45% opacity, the helper line would otherwise fail the contrast
  // minimum despite being correctly hidden away rather than miscolored; naming it disabled is
  // what claims the exemption an inactive component's own text already has.
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
        variant="register"
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

function CallerValueHarness(props: NoRangeHarnessProps) {
  const [value, setValue] = useState<CalendarDate | null>(null);
  return (
    <>
      <DateField {...props} value={value} onChange={setValue} />
      <p data-testid="caller-value">{value?.toString() ?? ""}</p>
    </>
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

// The allowed range includes both of the days that name it: the field refuses what falls outside
// the bounds, never the bounds themselves.
const RANGE_MIN = new CalendarDate(2027, 1, 1);
const RANGE_MAX = new CalendarDate(2027, 2, 28);
const RANGE_MESSAGE = "The date must be 28/02/2027 or earlier.";
const RANGE_HELPER = "A different expiry for the same product is entered as a separate line.";

// The literal box-shadow string Chromium renders for the focused state: a 2px brand-blue-ui inset
// with no outer shadow, behind the four transparent layers Tailwind v4 always composes (see
// TextField.test.tsx's FOCUSED_SHADOW comment for why they are there).
const FOCUSED_SHADOW =
  "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, " +
  "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, " +
  "rgb(79, 108, 126) 0px 0px 0px 2px inset";

async function focusFirstSegment(group: HTMLElement, variant: DateFieldProps["variant"]) {
  await userEvent.tab();
  if (variant === "register") {
    // The register variant leads with the calendar toggle button, so the first date segment is
    // its second tab stop; the backoffice variant trails that button and reaches a segment first.
    await userEvent.tab();
  }
  expect(document.activeElement).toBe(group.querySelector('[role="spinbutton"]'));
}

for (const variant of ["register", "backoffice"] as const) {
  test(`draws exactly the package's focused box shadow when a segment is focused in the ${variant} variant`, async () => {
    const screen = await render(<DateFieldHarness variant={variant} label="Expiry" />);
    const group = fieldGroup(screen, "Expiry");

    await focusFirstSegment(group, variant);

    await expect.poll(() => getComputedStyle(group).boxShadow).toBe(FOCUSED_SHADOW);

    await expectNoAccessibilityViolations(screen.container);
  });

  test(`keeps the focused border and white fill instead of the hovered bone one when both apply at once in the ${variant} variant`, async () => {
    const screen = await render(<DateFieldHarness variant={variant} label="Expiry" />);
    const group = fieldGroup(screen, "Expiry");

    await focusFirstSegment(group, variant);
    await userEvent.hover(group);
    // Both assertions below also hold for a focused field the pointer never reached: focus alone
    // paints the boundary, and white is the resting fill too. Focusing by keyboard leaves the hover
    // as the only thing that puts the pointer on the box, and the poll proves it got there before
    // asserting that focus won over it.
    await expect.poll(() => group.matches(":hover")).toBe(true);

    await expect.poll(() => getComputedStyle(group).boxShadow).toBe(FOCUSED_SHADOW);
    expect(getComputedStyle(group).backgroundColor).toBe(tokenRgb("surface-white"));

    await expectNoAccessibilityViolations(screen.container);
  });

  test(`shows the focused border instead of the out-of-range one once a refused field is focused in the ${variant} variant`, async () => {
    const screen = await render(
      <DateField
        variant={variant}
        label="Expiry"
        value={new CalendarDate(2027, 3, 15)}
        onChange={() => {}}
        minValue={RANGE_MIN}
        maxValue={RANGE_MAX}
        rangeMessage={RANGE_MESSAGE}
      />,
    );
    const group = fieldGroup(screen, "Expiry");

    await focusFirstSegment(group, variant);

    await expect.poll(() => getComputedStyle(group).boxShadow).toBe(FOCUSED_SHADOW);

    (document.activeElement as HTMLElement).blur();
    await expect
      .poll(() => paintedBoxShadowLayers(group))
      .toEqual([insetBoundary("status-error-ui", "2px")]);

    await expectNoAccessibilityViolations(screen.container);
  });

  test(`tells an empty field's placeholder from a date already entered, by tone, in the ${variant} variant`, async () => {
    const screen = await render(<DateFieldHarness variant={variant} label="Expiry" />);
    const group = fieldGroup(screen, "Expiry");
    const day = group.querySelector('[role="spinbutton"]') as HTMLElement;

    // Drawn in the value's own full-strength tone, an empty field reads as one already holding a
    // date; the package dims a placeholder to the secondary tone for exactly this reason
    // (see SearchField.tsx's own inputBaseClassName).
    expect(day.getAttribute("data-placeholder")).toBe("true");
    expect(getComputedStyle(day).color).toBe(tokenRgb("ink-secondary"));

    await userEvent.click(group);
    await userEvent.keyboard("28022027");

    await expect.poll(() => day.getAttribute("data-placeholder")).toBeNull();
    expect(getComputedStyle(day).color).toBe(tokenRgb("ink"));

    await expectNoAccessibilityViolations(screen.container);
  });

  test(`dims the separators along with the placeholder while the field holds no date in the ${variant} variant`, async () => {
    const screen = await render(<DateFieldHarness variant={variant} label="Expiry" />);
    const group = fieldGroup(screen, "Expiry");
    const separator = () => group.querySelector('[data-type="literal"]') as HTMLElement;
    expect(separator().textContent?.trim()).not.toBe("");

    // react-aria marks only editable segments as placeholders, so a separator left at the value's
    // own tone draws near-black slashes between dimmed digits: an empty field that reads as
    // half entered, which is the very thing dimming the placeholder is there to avoid.
    expect(getComputedStyle(separator()).color).toBe(tokenRgb("ink-secondary"));

    await userEvent.click(group);
    await userEvent.keyboard("28022027");

    // Once the field holds a date, the separators are part of the value the design draws.
    await expect.poll(() => getComputedStyle(separator()).color).toBe(tokenRgb("ink"));

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

    // The box's own focus shadow is the same whichever segment is active, and this field draws no
    // caret, so without a mark of its own nothing says where the next digit lands.
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

  // The register variant leads with the calendar button, so it is the field's first tab stop.
  await userEvent.tab();
  const button = screen.getByRole("button").element() as HTMLElement;
  expect(document.activeElement).toBe(button);

  await expect.poll(() => getComputedStyle(button).outlineStyle).toBe("solid");
  expect(getComputedStyle(button).outlineColor).toBe(tokenRgb("brand-blue-strong"));
  expect(Math.round(Number.parseFloat(getComputedStyle(button).outlineWidth))).toBe(3);
  // The package's own focus ring keeps a 3px offset everywhere else (Button, Checkbox, Modal,
  // OptionCardGroup, SegmentedControl, RadioGroup, IconButton, Toggle): this button is no
  // exception, so a narrower offset here would be a different, package-inconsistent ring.
  expect(Math.round(Number.parseFloat(getComputedStyle(button).outlineOffset))).toBe(3);

  await expectNoAccessibilityViolations(screen.container);
});

for (const variant of ["register", "backoffice"] as const) {
  test(`gives the calendar toggle button a 24px-minimum target around its 18px glyph in the ${variant} variant`, async () => {
    const screen = await render(<DateFieldHarness variant={variant} label="Expiry" />);
    const group = fieldGroup(screen, "Expiry");
    const toggle = group.querySelector("button") as HTMLElement;
    const toggleRect = toggle.getBoundingClientRect();

    // A pointer target smaller than 24x24 CSS px fails WCAG 2.5.8, and this package draws
    // touch-screen point-of-sale screens; an 18px glyph is not something a finger can aim at.
    expect(toggleRect.width).toBeGreaterThanOrEqual(24);
    expect(toggleRect.height).toBeGreaterThanOrEqual(24);

    // The glyph itself stays the size the design draws: the target grows around it, not with it.
    const icon = toggle.querySelector("svg") as SVGSVGElement;
    expect(icon.getBoundingClientRect().width).toBeCloseTo(18, 0);
    expect(icon.getBoundingClientRect().height).toBeCloseTo(18, 0);

    // And it grows inside the box the design draws, never past either variant's own height.
    const groupRect = group.getBoundingClientRect();
    expect(toggleRect.top).toBeGreaterThanOrEqual(groupRect.top);
    expect(toggleRect.bottom).toBeLessThanOrEqual(groupRect.bottom);

    await expectNoAccessibilityViolations(screen.container);
  });
}

// What the design draws is where the glyph sits, not where its pointer target does: the glyph's
// own leading edge is at the box's own padding, and the value starts one gap past the glyph.
const drawnGlyphInset: Record<DateFieldProps["variant"], number> = {
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

    // A 24px target around an 18px glyph is 3px wider than it on each side, so a target laid out
    // as an ordinary flex item would inset the glyph by that 3px and push the value 3px further
    // than the gap the design draws.
    if (variant === "register") {
      expect(glyphRect.left - groupRect.left).toBeCloseTo(drawnGlyphInset[variant], 0);
      expect(inputRect.left - glyphRect.right).toBeCloseTo(8, 0);
    } else {
      expect(groupRect.right - glyphRect.right).toBeCloseTo(drawnGlyphInset[variant], 0);
      expect(glyphRect.left - inputRect.right).toBeCloseTo(8, 0);
    }

    // Putting the glyph back on the drawing moves the target, it never shrinks it.
    const toggleRect = toggle.getBoundingClientRect();
    expect(toggleRect.width).toBeGreaterThanOrEqual(24);
    expect(toggleRect.height).toBeGreaterThanOrEqual(24);

    await expectNoAccessibilityViolations(screen.container);
  });
}

// react-aria-components portals the calendar's whole DOM into document.body, outside
// vitest-browser-react's own render container (see Tooltip.test.tsx's own comment on this), so
// every accessibility check about the open calendar audits document.body rather than
// screen.container.

async function openCalendar(screen: Screen, name: string): Promise<HTMLElement> {
  const group = fieldGroup(screen, name);
  const toggle = group.querySelector("button") as HTMLElement;
  await userEvent.click(toggle);
  await expect.poll(() => screen.getByRole("dialog").elements().length).toBe(1);
  return screen.getByRole("dialog").element() as HTMLElement;
}

test("opens a white 8px-radius panel with a 1px secondary boundary clearing 3:1 against white", async () => {
  const screen = await render(<DateFieldHarness variant="register" label="Expiry" />);
  const dialog = await openCalendar(screen, "Expiry");
  const style = getComputedStyle(dialog);

  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(style.borderRadius).toBe("8px");
  expect(paintedBoxShadowLayers(dialog)).toEqual([insetBoundary("ink-secondary", "1px")]);

  const boundaryHex = boundaryColorHex(dialog);
  const fillHex = rgbToHex(style.backgroundColor);
  expect(contrastRatio(boundaryHex, fillHex)).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);

  await expectNoAccessibilityViolations(document.body);
});

test("shows the month and year heading with previous and next controls, each with a real accessible name", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 28));
    return <DateField variant="register" label="Expiry" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const dialog = await openCalendar(screen, "Expiry");

  const heading = dialog.querySelector("h2") as HTMLElement;
  expect(heading.textContent).toContain("2027");
  expect(heading.textContent?.toLowerCase()).toContain("febrero");

  const previous = document.body.querySelector('[slot="previous"]') as HTMLElement;
  const next = document.body.querySelector('[slot="next"]') as HTMLElement;
  expect(previous.getAttribute("aria-label")).toBeTruthy();
  expect(next.getAttribute("aria-label")).toBeTruthy();

  await expectNoAccessibilityViolations(document.body);
});

test("draws the calendar's weekday row in the package's own supporting tone and scale", async () => {
  const screen = await render(<DateFieldHarness variant="register" label="Expiry" />);
  const dialog = await openCalendar(screen, "Expiry");

  const weekdays = Array.from(dialog.querySelectorAll("th")) as HTMLElement[];
  expect(weekdays).toHaveLength(7);

  for (const weekday of weekdays) {
    expect(weekday.textContent?.trim()).not.toBe("");
    const style = getComputedStyle(weekday);
    // Without a scale and tone of its own this row falls back to inherited typography, which is
    // the only calendar surface that does.
    expect(Math.round(Number.parseFloat(style.fontSize))).toBe(14);
    expect(style.fontWeight).toBe("400");
    expect(style.color).toBe(tokenRgb("ink-secondary"));
    expect(
      contrastRatio(rgbToHex(style.color), rgbToHex(getComputedStyle(dialog).backgroundColor)),
    ).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
  }

  await expectNoAccessibilityViolations(document.body);
});

test("dims the calendar's month controls once the allowed range reaches no further month", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 15));
    return (
      <DateField
        variant="register"
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
  // Every inert control in this package dims to 45%; at full strength these two read as working
  // controls that silently do nothing.
  expect(getComputedStyle(previous).opacity).toBe("0.45");
  expect(getComputedStyle(next).opacity).toBe("0.45");
  // The hand cursor promises a control that responds; neither one does here.
  expect(getComputedStyle(previous).cursor).toBe("default");
  expect(getComputedStyle(next).cursor).toBe("default");

  await userEvent.hover(previous);
  expect(getComputedStyle(previous).backgroundColor).not.toBe(tokenRgb("surface-bone"));

  await expectNoAccessibilityViolations(document.body);
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
    return <DateField variant="register" label="Expiry" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const dialog = await openCalendar(screen, "Expiry");

  const chosen = dialog.querySelector('[data-selected="true"]') as HTMLElement;
  expect(chosen.textContent?.trim()).toBe("28");
  const style = getComputedStyle(chosen);
  expect(style.backgroundColor).toBe(tokenRgb("brand-blue-ui"));
  expect(style.color).toBe(tokenRgb("surface-white"));

  const fillHex = rgbToHex(style.backgroundColor);
  const textHex = rgbToHex(style.color);
  expect(contrastRatio(textHex, fillHex)).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);

  await expectNoAccessibilityViolations(document.body);
});

test("shows an unchosen day in ink that turns bone on hover", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 28));
    return <DateField variant="register" label="Expiry" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const dialog = await openCalendar(screen, "Expiry");

  const cells = Array.from(dialog.querySelectorAll("td [role='button']")) as HTMLElement[];
  const unchosen = cells.find((cell) => cell.textContent?.trim() === "15") as HTMLElement;
  expect(getComputedStyle(unchosen).color).toBe(tokenRgb("ink"));

  await userEvent.hover(unchosen);
  await expect
    .poll(() => getComputedStyle(unchosen).backgroundColor)
    .toBe(tokenRgb("surface-bone"));

  await expectNoAccessibilityViolations(document.body);
});

test("shows the hand cursor on a selectable day and the arrow on a day outside the allowed range", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 15));
    return (
      <DateField
        variant="register"
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

  await expectNoAccessibilityViolations(document.body);
});

test("shows the package's own outline focus ring on the focused day", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 28));
    return <DateField variant="register" label="Expiry" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const group = fieldGroup(screen, "Expiry");
  const toggle = group.querySelector("button") as HTMLElement;

  // Opening with the keyboard, instead of a click, keeps the input modality "keyboard" so the day
  // react-aria auto-focuses on open (the chosen day) shows its focus-visible ring, the same way a
  // real keyboard-only user would open it.
  toggle.focus();
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => screen.getByRole("dialog").elements().length).toBe(1);
  const dialog = screen.getByRole("dialog").element() as HTMLElement;

  const focused = dialog.querySelector('[data-focus-visible="true"]') as HTMLElement;
  expect(focused, "no keyboard-focused day cell found once the calendar opened").not.toBeNull();
  const style = getComputedStyle(focused);
  expect(style.outlineStyle).toBe("solid");
  expect(style.outlineColor).toBe(tokenRgb("brand-blue-strong"));
  // Same package-wide 3px offset as every other focus ring (see the calendar toggle button's own
  // test above).
  expect(Math.round(Number.parseFloat(style.outlineOffset))).toBe(3);

  await expectNoAccessibilityViolations(document.body);
});

test("keeps the focused day's outline ring inside the calendar panel", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 15));
    return <DateField variant="register" label="Expiry" value={value} onChange={setValue} />;
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

test("keeps at least the focus ring's own reach as a real gap between adjacent day cells, horizontally and vertically", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 17));
    return <DateField variant="register" label="Expiry" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const group = fieldGroup(screen, "Expiry");
  const toggle = group.querySelector("button") as HTMLElement;

  toggle.focus();
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => screen.getByRole("dialog").elements().length).toBe(1);
  const dialog = screen.getByRole("dialog").element() as HTMLElement;

  const focused = dialog.querySelector('[data-focus-visible="true"]') as HTMLElement;
  const ringExtent =
    Number.parseFloat(getComputedStyle(focused).outlineWidth) +
    Number.parseFloat(getComputedStyle(focused).outlineOffset);

  const focusedTd = focused.closest("td") as HTMLElement;
  const row = focusedTd.parentElement as HTMLElement;
  const rowCells = Array.from(row.children) as HTMLElement[];
  const focusedIndex = rowCells.indexOf(focusedTd);
  const rightNeighbour = rowCells[focusedIndex + 1];
  if (!rightNeighbour) {
    throw new Error("no cell to the right of the focused day in the same week");
  }
  const horizontalGap =
    rightNeighbour.getBoundingClientRect().left - focusedTd.getBoundingClientRect().right;
  expect(horizontalGap, "gap between horizontally adjacent day cells").toBeGreaterThanOrEqual(
    ringExtent,
  );

  const rows = Array.from((row.parentElement as HTMLElement).children) as HTMLElement[];
  const rowIndex = rows.indexOf(row);
  const belowRow = rows[rowIndex + 1];
  if (!belowRow) {
    throw new Error("no week below the focused day's own week");
  }
  const belowNeighbour = belowRow.children[focusedIndex] as HTMLElement;
  const verticalGap =
    belowNeighbour.getBoundingClientRect().top - focusedTd.getBoundingClientRect().bottom;
  expect(verticalGap, "gap between vertically adjacent day cells").toBeGreaterThanOrEqual(
    ringExtent,
  );

  await expectNoAccessibilityViolations(document.body);
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
    return <DateField variant="register" label="Expiry" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const dialog = await openCalendarWithKeyboard(screen, "Expiry");

  expect(focusedDayLabel(dialog)).toBe("1");

  // Moving left from the first day of the month wraps into the last day of January.
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
        <DateField variant="register" label="Expiry" value={value} onChange={setValue} />
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

  await expectNoAccessibilityViolations(document.body);
});

test("refuses a date outside the caller's allowed range, showing its message under the field in error UI", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 3, 15));
    return (
      <DateField
        variant="register"
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

  expect(paintedBoxShadowLayers(group)).toEqual([insetBoundary("status-error-ui", "2px")]);
  const message = screen.getByText("The date must be 28/02/2027 or earlier.");
  await expect.element(message).toBeVisible();
  expect(getComputedStyle(message.element()).color).toBe(tokenRgb("status-error-ui"));

  await expectNoAccessibilityViolations(screen.container);
});

test("does not select the out-of-range day in the calendar", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 3, 15));
    return (
      <DateField
        variant="register"
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
      variant="register"
      label="Expiry"
      value={current}
      onChange={setCurrent}
      minValue={RANGE_MIN}
      maxValue={RANGE_MAX}
      rangeMessage={RANGE_MESSAGE}
      helperText={RANGE_HELPER}
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

    expect(paintedBoxShadowLayers(group)).toEqual([insetBoundary("line", "2px")]);
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
          variant="register"
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

  // The caller hears every complete date the user finishes, in range or not: it is the caller's
  // own decision what to do with one the field is refusing.
  await expect
    .poll(() => screen.getByTestId("caller-value").element().textContent)
    .toBe("2027-03-15");

  await expect.element(screen.getByText(RANGE_MESSAGE)).toBeVisible();

  // The focused box draws the package's focus border over every other state, so the refused
  // boundary is what the field settles on once the user moves away from it.
  (document.activeElement as HTMLElement).blur();
  await expect
    .poll(() => getComputedStyle(group).boxShadow)
    .toContain(insetBoundary("status-error-ui", "2px"));

  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept an allowed range without the message the field shows outside it", () => {
  expectTypeOf<{
    variant: "register";
    label: string;
    value: CalendarDate | null;
    onChange: (value: CalendarDate | null) => void;
    minValue: CalendarDate;
  }>().not.toExtend<DateFieldProps>();
  expectTypeOf<{
    variant: "register";
    label: string;
    value: CalendarDate | null;
    onChange: (value: CalendarDate | null) => void;
    maxValue: CalendarDate;
  }>().not.toExtend<DateFieldProps>();
});

test("accepts a field with no range at all, and separately with a range and its message", () => {
  expectTypeOf<{
    variant: "register";
    label: string;
    value: CalendarDate | null;
    onChange: (value: CalendarDate | null) => void;
  }>().toExtend<DateFieldProps>();
  expectTypeOf<{
    variant: "register";
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
    variant: "register";
    label: string;
    value: string;
    onChange: (value: string) => void;
  }>().not.toExtend<DateFieldProps>();
  expectTypeOf<{
    variant: "register";
    label: string;
    value: CalendarDate | null;
    onChange: (value: CalendarDate | null) => void;
    minValue: string;
    maxValue: string;
    rangeMessage: string;
  }>().not.toExtend<DateFieldProps>();
});

test("does not accept a field without a variant, a label, a value or onChange", () => {
  expectTypeOf<{
    label: string;
    value: CalendarDate | null;
    onChange: (value: CalendarDate | null) => void;
  }>().not.toExtend<DateFieldProps>();
  expectTypeOf<{
    variant: "register";
    value: CalendarDate | null;
    onChange: (value: CalendarDate | null) => void;
  }>().not.toExtend<DateFieldProps>();
  expectTypeOf<{
    variant: "register";
    label: string;
    onChange: (value: CalendarDate | null) => void;
  }>().not.toExtend<DateFieldProps>();
  expectTypeOf<{
    variant: "register";
    label: string;
    value: CalendarDate | null;
  }>().not.toExtend<DateFieldProps>();
});

test("holds a day the calendar system itself constrains, with no text left for the field to parse", async () => {
  function ControlledHarness() {
    // February 30th: the calendar system constrains it to the month's real last day instead of
    // refusing it, so no caller value can reach the field as something it cannot render.
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 30));
    return <DateField variant="register" label="Expiry" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const group = fieldGroup(screen, "Expiry");

  expect(group.textContent).toContain("28");
  expect(group.textContent).toContain("02");
  expect(group.textContent).toContain("2027");

  await expectNoAccessibilityViolations(screen.container);
});

test("announces the field with its label and current value through its segments", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 28));
    return <DateField variant="register" label="Expiry" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const group = fieldGroup(screen, "Expiry");
  expect(group.getAttribute("aria-label") ?? group.getAttribute("aria-labelledby")).toBeTruthy();

  const segments = Array.from(group.querySelectorAll('[role="spinbutton"]')) as HTMLElement[];
  const valueTexts = segments.map((segment) => segment.getAttribute("aria-valuetext") ?? "");

  expect(valueTexts.some((text) => text.includes("28"))).toBe(true);
  expect(valueTexts.some((text) => text.toLowerCase().includes("febrero"))).toBe(true);
  expect(valueTexts.some((text) => text.includes("2027"))).toBe(true);

  await expectNoAccessibilityViolations(screen.container);
});

test("announces the open calendar as a dialog named by the month and year it shows", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 28));
    return <DateField variant="register" label="Expiry" value={value} onChange={setValue} />;
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

  expect(composedName.toLowerCase()).toContain("febrero");
  expect(composedName).toContain("2027");

  await expectNoAccessibilityViolations(document.body);
});

test("announces the chosen day's button as selected", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2027, 2, 28));
    return <DateField variant="register" label="Expiry" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const dialog = await openCalendar(screen, "Expiry");

  const chosen = dialog.querySelector('[data-selected="true"]') as HTMLElement;
  expect(chosen.closest("td")?.getAttribute("aria-selected")).toBe("true");

  await expectNoAccessibilityViolations(document.body);
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
    const screen = await render(
      <DateField
        variant={variant}
        label="Start"
        value={null}
        onChange={() => {}}
        helperText="Should not be visible."
        invalid
        errorMessage="Choose a start date."
      />,
    );
    const group = fieldGroup(screen, "Start");

    expect(paintedBoxShadowLayers(group)).toEqual([insetBoundary("status-error-ui", "2px")]);
    const message = screen.getByText("Choose a start date.");
    await expect.element(message).toBeVisible();
    expect(getComputedStyle(message.element()).color).toBe(tokenRgb("status-error-ui"));
    expect(screen.getByText("Should not be visible.").query()).toBeNull();
    for (const segment of segmentsOf(group)) {
      expect(segment.getAttribute("aria-invalid")).toBe("true");
      expect(describedTextOf(segment)).toContain("Choose a start date.");
    }

    await expectNoAccessibilityViolations(screen.container);
  });
}

test("shows the caller's message instead of the range message when both apply", async () => {
  const screen = await render(
    <DateField
      variant="backoffice"
      label="Start"
      value={new CalendarDate(2027, 3, 15)}
      onChange={() => {}}
      maxValue={RANGE_MAX}
      rangeMessage={RANGE_MESSAGE}
      invalid
      errorMessage="The date cannot be in the future."
    />,
  );

  await expect.element(screen.getByText("The date cannot be in the future.")).toBeVisible();
  expect(screen.getByText(RANGE_MESSAGE).query()).toBeNull();

  await expectNoAccessibilityViolations(screen.container);
});

test("marks a required field with an asterisk and exposes it as required", async () => {
  const screen = await render(
    <DateField variant="backoffice" label="Start" value={null} onChange={() => {}} required />,
  );
  const label = screen.getByText("Start").element() as HTMLElement;
  // The generated asterisk folds into the group's accessible name, as TextField.test.tsx notes.
  const group = screen.getByRole("group", { name: /^Start/ }).element() as HTMLElement;

  expect(getComputedStyle(label, "::after").content).toContain("*");
  for (const segment of segmentsOf(group)) {
    expect(segment.getAttribute("aria-required")).toBe("true");
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept an invalid field without the message it shows", () => {
  expectTypeOf<{
    variant: "backoffice";
    label: string;
    value: CalendarDate | null;
    onChange: (value: CalendarDate | null) => void;
    invalid: true;
  }>().not.toExtend<DateFieldProps>();
  expectTypeOf<{
    variant: "backoffice";
    label: string;
    value: CalendarDate | null;
    onChange: (value: CalendarDate | null) => void;
    invalid: true;
    errorMessage: string;
    required: true;
  }>().toExtend<DateFieldProps>();
});
