import { useState } from "react";
import { beforeEach, expect, expectTypeOf, test } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { AA_TEXT_CONTRAST, contrastRatio, NON_TEXT_CONTRAST } from "../styles/contrast";
import { expectNoAccessibilityViolations } from "../test/axe";
import type { DispatchableCdpSession } from "../test/setup-browser";
import { boundaryColorHex, insetBoundary, rgbToHex, tokenRgb } from "../test/token-colors";
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
  const [value, setValue] = useState("");
  return <DateField {...props} value={value} onChange={setValue} />;
}

test("renders the register variant at 56px with 16px padding, a leading icon, bold 20px ink value and bold 16px ink label", async () => {
  const screen = await render(<DateFieldHarness variant="register" label="Vencimiento" />);
  const group = fieldGroup(screen, "Vencimiento");
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

  const label = screen.getByText("Vencimiento").element() as HTMLElement;
  expect(getComputedStyle(label).fontWeight).toBe("700");
  expect(Math.round(Number.parseFloat(getComputedStyle(label).fontSize))).toBe(16);
  expect(getComputedStyle(label).color).toBe(tokenRgb("ink"));

  await expectNoAccessibilityViolations(screen.container);
});

test("renders the backoffice variant at 48px with 12px padding and a trailing icon", async () => {
  const screen = await render(<DateFieldHarness variant="backoffice" label="Fecha" />);
  const group = fieldGroup(screen, "Fecha");
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

  const label = screen.getByText("Fecha").element() as HTMLElement;
  expect(getComputedStyle(label).fontWeight).toBe("700");
  expect(Math.round(Number.parseFloat(getComputedStyle(label).fontSize))).toBe(14);
  expect(getComputedStyle(label).color).toBe(tokenRgb("ink-secondary"));

  await expectNoAccessibilityViolations(screen.container);
});

test("shows the helper line under the register field when supplied", async () => {
  const screen = await render(
    <DateFieldHarness
      variant="register"
      label="Vencimiento"
      helperText="Si el mismo producto tiene otro vencimiento, se carga como una línea aparte."
    />,
  );

  const helper = screen.getByText(
    "Si el mismo producto tiene otro vencimiento, se carga como una línea aparte.",
  );
  await expect.element(helper).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the label 6px above the register field's box, as design.pen's Vf9w7 frame draws", async () => {
  const screen = await render(<DateFieldHarness variant="register" label="Vencimiento" />);
  const wrapper = fieldGroup(screen, "Vencimiento").parentElement as HTMLElement;

  expect(Math.round(Number.parseFloat(getComputedStyle(wrapper).rowGap))).toBe(6);

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the label 4px above the backoffice field's box, as design.pen's compact Fecha frames draw", async () => {
  const screen = await render(<DateFieldHarness variant="backoffice" label="Fecha" />);
  const wrapper = fieldGroup(screen, "Fecha").parentElement as HTMLElement;

  expect(Math.round(Number.parseFloat(getComputedStyle(wrapper).rowGap))).toBe(4);

  await expectNoAccessibilityViolations(screen.container);
});

for (const variant of ["register", "backoffice"] as const) {
  test(`shows a white box with a 2px ink-secondary border at rest in the ${variant} variant`, async () => {
    const screen = await render(<DateFieldHarness variant={variant} label="Vencimiento" />);
    const group = fieldGroup(screen, "Vencimiento");
    const style = getComputedStyle(group);

    expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
    expect(style.boxShadow).toContain(insetBoundary("ink-secondary", "2px"));

    await expectNoAccessibilityViolations(screen.container);
  });

  test(`clears the non-text 3:1 contrast minimum between the box's own painted boundary and fill, resting and hovered, in the ${variant} variant`, async () => {
    const screen = await render(<DateFieldHarness variant={variant} label="Vencimiento" />);
    const group = fieldGroup(screen, "Vencimiento");

    const restingFill = getComputedStyle(group).backgroundColor;
    expect(restingFill).toBe(tokenRgb("surface-white"));
    const restingBoundaryHex = boundaryColorHex(group);
    expect(contrastRatio(restingBoundaryHex, rgbToHex(restingFill))).toBeGreaterThanOrEqual(
      NON_TEXT_CONTRAST,
    );

    await userEvent.hover(group);
    await expect.poll(() => getComputedStyle(group).backgroundColor).toBe(tokenRgb("surface-bone"));

    const hoveredBoundaryHex = boundaryColorHex(group);
    const hoveredFillHex = rgbToHex(getComputedStyle(group).backgroundColor);
    expect(contrastRatio(hoveredBoundaryHex, hoveredFillHex)).toBeGreaterThanOrEqual(
      NON_TEXT_CONTRAST,
    );

    await expectNoAccessibilityViolations(screen.container);
  });

  test(`shows a 3px blue-strong border and the focus shadow when a segment is focused in the ${variant} variant`, async () => {
    const screen = await render(<DateFieldHarness variant={variant} label="Vencimiento" />);
    const group = fieldGroup(screen, "Vencimiento");

    await userEvent.tab();

    await expect
      .poll(() => getComputedStyle(group).boxShadow)
      .toContain(tokenRgb("brand-blue-strong"));

    await expectNoAccessibilityViolations(screen.container);
  });

  test(`dims the whole field to 45% opacity and blocks focus when disabled in the ${variant} variant`, async () => {
    const screen = await render(
      <>
        <DateFieldHarness variant={variant} label="Vencimiento" disabled />
        <button type="button">Next control</button>
      </>,
    );
    const group = fieldGroup(screen, "Vencimiento");
    const wrapper = group.parentElement as HTMLElement;
    const nextControl = screen.getByRole("button", { name: "Next control" }).element();

    expect(getComputedStyle(wrapper).opacity).toBe("0.45");
    expect(getComputedStyle(group).backgroundColor).toBe(tokenRgb("surface-white"));
    expect(getComputedStyle(group).boxShadow).toContain(insetBoundary("ink-secondary", "2px"));

    await userEvent.tab();
    expect(document.activeElement).toBe(nextControl);

    await expectNoAccessibilityViolations(screen.container);
  });
}

test("reads the date as it is typed, day by day, month by month, and a four-digit year", async () => {
  const screen = await render(<DateFieldHarness variant="register" label="Vencimiento" />);
  const group = fieldGroup(screen, "Vencimiento");

  await userEvent.click(group);
  await userEvent.keyboard("28022027");

  expect(group.textContent).toContain("28");
  expect(group.textContent).toContain("02");
  expect(group.textContent).toContain("2027");

  await expectNoAccessibilityViolations(screen.container);
});

function CallerValueHarness(props: NoRangeHarnessProps) {
  const [value, setValue] = useState("");
  return (
    <>
      <DateField {...props} value={value} onChange={setValue} />
      <p data-testid="caller-value">{value}</p>
    </>
  );
}

test("tells the caller the complete date once typing finishes it", async () => {
  const screen = await render(<CallerValueHarness variant="register" label="Vencimiento" />);
  const group = fieldGroup(screen, "Vencimiento");

  await userEvent.click(group);
  await userEvent.keyboard("28022027");

  await expect
    .poll(() => screen.getByTestId("caller-value").element().textContent)
    .toBe("2027-02-28");

  await expectNoAccessibilityViolations(screen.container);
});

// The literal box-shadow string Chromium renders for the focused state, pinned to
// TextField.test.tsx's own FOCUSED_SHADOW literal (see its comment there): DateField reuses that
// exact border system verbatim.
const FOCUSED_SHADOW =
  "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, " +
  "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, " +
  "rgb(51, 79, 96) 0px 0px 0px 3px inset, rgba(79, 108, 126, 0.2) 0px 0px 0px 4px";

test("shows a 3px blue-strong border and the focus shadow when a segment is focused", async () => {
  const screen = await render(<DateFieldHarness variant="register" label="Vencimiento" />);
  const group = fieldGroup(screen, "Vencimiento");

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(group).boxShadow).toBe(FOCUSED_SHADOW);

  await expectNoAccessibilityViolations(screen.container);
});

test("shows the package's own outline focus ring on the calendar button when it is keyboard-focused", async () => {
  const screen = await render(<DateFieldHarness variant="register" label="Vencimiento" />);

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
  const screen = await render(<DateFieldHarness variant="register" label="Vencimiento" />);
  const dialog = await openCalendar(screen, "Vencimiento");
  const style = getComputedStyle(dialog);

  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(style.borderRadius).toBe("8px");
  expect(style.boxShadow).toContain(insetBoundary("ink-secondary", "1px"));

  const boundaryHex = boundaryColorHex(dialog);
  const fillHex = rgbToHex(style.backgroundColor);
  expect(contrastRatio(boundaryHex, fillHex)).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);

  await expectNoAccessibilityViolations(document.body);
});

test("shows the month and year heading with previous and next controls, each with a real accessible name", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState("2027-02-28");
    return <DateField variant="register" label="Vencimiento" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const dialog = await openCalendar(screen, "Vencimiento");

  const heading = dialog.querySelector("h2") as HTMLElement;
  expect(heading.textContent).toContain("2027");
  expect(heading.textContent?.toLowerCase()).toContain("febrero");

  const previous = document.body.querySelector('[slot="previous"]') as HTMLElement;
  const next = document.body.querySelector('[slot="next"]') as HTMLElement;
  expect(previous.getAttribute("aria-label")).toBeTruthy();
  expect(next.getAttribute("aria-label")).toBeTruthy();

  await expectNoAccessibilityViolations(document.body);
});

test("shows the chosen day with a blue UI fill and a white number, clearing the AA text contrast minimum", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState("2027-02-28");
    return <DateField variant="register" label="Vencimiento" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const dialog = await openCalendar(screen, "Vencimiento");

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
    const [value, setValue] = useState("2027-02-28");
    return <DateField variant="register" label="Vencimiento" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const dialog = await openCalendar(screen, "Vencimiento");

  const cells = Array.from(dialog.querySelectorAll("td [role='button']")) as HTMLElement[];
  const unchosen = cells.find((cell) => cell.textContent?.trim() === "15") as HTMLElement;
  expect(getComputedStyle(unchosen).color).toBe(tokenRgb("ink"));

  await userEvent.hover(unchosen);
  await expect
    .poll(() => getComputedStyle(unchosen).backgroundColor)
    .toBe(tokenRgb("surface-bone"));

  await expectNoAccessibilityViolations(document.body);
});

test("shows the package's own outline focus ring on the focused day", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState("2027-02-28");
    return <DateField variant="register" label="Vencimiento" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const group = fieldGroup(screen, "Vencimiento");
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
    const [value, setValue] = useState("2027-02-15");
    return <DateField variant="register" label="Vencimiento" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const group = fieldGroup(screen, "Vencimiento");
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
    const [value, setValue] = useState("2027-02-17");
    return <DateField variant="register" label="Vencimiento" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const group = fieldGroup(screen, "Vencimiento");
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
    const [value, setValue] = useState("2027-02-01");
    return <DateField variant="register" label="Vencimiento" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const dialog = await openCalendarWithKeyboard(screen, "Vencimiento");

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
  const screen = await render(<CallerValueHarness variant="register" label="Vencimiento" />);
  const dialog = await openCalendarWithKeyboard(screen, "Vencimiento");
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
  const screen = await render(<CallerValueHarness variant="register" label="Vencimiento" />);
  await openCalendarWithKeyboard(screen, "Vencimiento");

  await userEvent.keyboard(" ");

  await expect.poll(() => screen.getByRole("dialog").elements().length).toBe(0);
  await expect.poll(() => screen.getByTestId("caller-value").element().textContent).not.toBe("");

  await expectNoAccessibilityViolations(screen.container);
});

test("closes the calendar without changing the field when Escape is pressed", async () => {
  const screen = await render(<CallerValueHarness variant="register" label="Vencimiento" />);
  await openCalendarWithKeyboard(screen, "Vencimiento");

  await userEvent.keyboard("{Escape}");

  await expect.poll(() => screen.getByRole("dialog").elements().length).toBe(0);
  expect(screen.getByTestId("caller-value").element().textContent).toBe("");

  await expectNoAccessibilityViolations(screen.container);
});

test("clicking a day with the mouse chooses it, updates the typed value and closes the calendar", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState("2027-02-01");
    return (
      <>
        <DateField variant="register" label="Vencimiento" value={value} onChange={setValue} />
        <p data-testid="caller-value">{value}</p>
      </>
    );
  }
  const screen = await render(<ControlledHarness />);
  const dialog = await openCalendar(screen, "Vencimiento");

  const cells = Array.from(dialog.querySelectorAll("td [role='button']")) as HTMLElement[];
  const target = cells.find((cell) => cell.textContent?.trim() === "15") as HTMLElement;
  await userEvent.click(target);

  await expect.poll(() => screen.getByRole("dialog").elements().length).toBe(0);
  await expect
    .poll(() => screen.getByTestId("caller-value").element().textContent)
    .toBe("2027-02-15");

  const group = fieldGroup(screen, "Vencimiento");
  expect(group.textContent).toContain("15");

  await expectNoAccessibilityViolations(screen.container);
});

test("updates the calendar's chosen day once typing finishes a complete valid date", async () => {
  const screen = await render(<CallerValueHarness variant="register" label="Vencimiento" />);
  const group = fieldGroup(screen, "Vencimiento");

  await userEvent.click(group);
  await userEvent.keyboard("28022027");
  await expect
    .poll(() => screen.getByTestId("caller-value").element().textContent)
    .toBe("2027-02-28");

  const dialog = await openCalendar(screen, "Vencimiento");
  const chosen = dialog.querySelector('[data-selected="true"]') as HTMLElement;
  expect(chosen.textContent?.trim()).toBe("28");

  await expectNoAccessibilityViolations(document.body);
});

test("refuses a date outside the caller's allowed range, showing its message under the field in error UI", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState("2027-03-15");
    return (
      <DateField
        variant="register"
        label="Vencimiento"
        value={value}
        onChange={setValue}
        minValue="2027-01-01"
        maxValue="2027-02-28"
        rangeMessage="La fecha debe estar antes del 28/02/2027."
      />
    );
  }
  const screen = await render(<ControlledHarness />);
  const group = fieldGroup(screen, "Vencimiento");
  const style = getComputedStyle(group);

  expect(style.boxShadow).toContain(insetBoundary("status-error-ui", "2px"));
  const message = screen.getByText("La fecha debe estar antes del 28/02/2027.");
  await expect.element(message).toBeVisible();
  expect(getComputedStyle(message.element()).color).toBe(tokenRgb("status-error-ui"));

  await expectNoAccessibilityViolations(screen.container);
});

test("does not select the out-of-range day in the calendar", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState("2027-03-15");
    return (
      <DateField
        variant="register"
        label="Vencimiento"
        value={value}
        onChange={setValue}
        minValue="2027-01-01"
        maxValue="2027-02-28"
        rangeMessage="La fecha debe estar antes del 28/02/2027."
      />
    );
  }
  const screen = await render(<ControlledHarness />);
  const dialog = await openCalendar(screen, "Vencimiento");

  expect(dialog.querySelector('[data-selected="true"]')).toBeNull();

  await expectNoAccessibilityViolations(document.body);
});

test("does not accept an allowed range without the message the field shows outside it", () => {
  expectTypeOf<{
    variant: "register";
    label: string;
    value: string;
    onChange: (value: string) => void;
    minValue: string;
  }>().not.toExtend<DateFieldProps>();
  expectTypeOf<{
    variant: "register";
    label: string;
    value: string;
    onChange: (value: string) => void;
    maxValue: string;
  }>().not.toExtend<DateFieldProps>();
});

test("accepts a field with no range at all, and separately with a range and its message", () => {
  expectTypeOf<{
    variant: "register";
    label: string;
    value: string;
    onChange: (value: string) => void;
  }>().toExtend<DateFieldProps>();
  expectTypeOf<{
    variant: "register";
    label: string;
    value: string;
    onChange: (value: string) => void;
    minValue: string;
    maxValue: string;
    rangeMessage: string;
  }>().toExtend<DateFieldProps>();
});

test("does not accept a field without a variant, a label, a value or onChange", () => {
  expectTypeOf<{
    label: string;
    value: string;
    onChange: (value: string) => void;
  }>().not.toExtend<DateFieldProps>();
  expectTypeOf<{
    variant: "register";
    value: string;
    onChange: (value: string) => void;
  }>().not.toExtend<DateFieldProps>();
  expectTypeOf<{
    variant: "register";
    label: string;
    onChange: (value: string) => void;
  }>().not.toExtend<DateFieldProps>();
  expectTypeOf<{
    variant: "register";
    label: string;
    value: string;
  }>().not.toExtend<DateFieldProps>();
});

test("announces the field with its label and current value through its segments", async () => {
  function ControlledHarness() {
    const [value, setValue] = useState("2027-02-28");
    return <DateField variant="register" label="Vencimiento" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const group = fieldGroup(screen, "Vencimiento");
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
    const [value, setValue] = useState("2027-02-28");
    return <DateField variant="register" label="Vencimiento" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  await openCalendar(screen, "Vencimiento");

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
    const [value, setValue] = useState("2027-02-28");
    return <DateField variant="register" label="Vencimiento" value={value} onChange={setValue} />;
  }
  const screen = await render(<ControlledHarness />);
  const dialog = await openCalendar(screen, "Vencimiento");

  const chosen = dialog.querySelector('[data-selected="true"]') as HTMLElement;
  expect(chosen.closest("td")?.getAttribute("aria-selected")).toBe("true");

  await expectNoAccessibilityViolations(document.body);
});
