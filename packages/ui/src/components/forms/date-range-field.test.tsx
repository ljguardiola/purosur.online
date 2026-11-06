import { CalendarDate } from "@internationalized/date";
import { useId, useState } from "react";
import { beforeEach, expect, expectTypeOf, test } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { AA_TEXT_CONTRAST, contrastRatio } from "../../styles/contrast";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { insetBoundary, paintedBoxShadowLayers, rgbToHex, tokenRgb } from "../../test/token-colors";
import { type DateRange, DateRangeField, type DateRangeFieldProps } from "./date-range-field";
import { type FieldSize, FieldSizeProvider } from "./field-size";

type Screen = Awaited<ReturnType<typeof render>>;

beforeEach(async () => {
  await page.viewport(1280, 900);
  const session = cdp();
  await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
});

function fieldGroup(screen: Screen, name: string): HTMLElement {
  return screen.getByRole("group", { name: new RegExp(`^${name}`) }).element() as HTMLElement;
}

function segmentsOf(group: HTMLElement): HTMLElement[] {
  return Array.from(group.querySelectorAll('[role="spinbutton"]'));
}

function describedTextOf(element: HTMLElement): string {
  return (element.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter((id) => id !== "")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

async function openCalendar(screen: Screen, name: string): Promise<HTMLElement> {
  const group = fieldGroup(screen, name);
  await userEvent.click(group.querySelector("button") as HTMLElement);
  await expect.poll(() => screen.getByRole("dialog").elements().length).toBe(1);
  return screen.getByRole("dialog").element() as HTMLElement;
}

function dayButton(dialog: HTMLElement, day: string): HTMLElement {
  const days = Array.from(dialog.querySelectorAll<HTMLElement>("td [role='button']"));
  return days.find((cell) => cell.textContent?.trim() === day) as HTMLElement;
}

function periodText(value: DateRange | null): string {
  return value === null ? "" : `${value.start.toString()}..${value.end.toString()}`;
}

type HarnessProps = {
  variant?: FieldSize;
  label?: string;
  initial?: DateRange | null;
  description?: string;
  disabled?: boolean;
  required?: boolean;
  errorMessage?: string;
  bounds?: { minValue: CalendarDate; maxValue: CalendarDate; rangeMessage: string };
};

function Harness({
  variant = "backoffice",
  label = "Period",
  initial = null,
  bounds,
  ...rest
}: HarnessProps) {
  const [value, setValue] = useState<DateRange | null>(initial);
  const field = (
    <>
      <DateRangeField
        name="period"
        label={label}
        value={value}
        onChange={setValue}
        {...rest}
        {...bounds}
      />
      <p data-testid="caller-value">{periodText(value)}</p>
    </>
  );
  return variant === "backoffice" ? (
    <FieldSizeProvider size="backoffice">{field}</FieldSizeProvider>
  ) : (
    field
  );
}

const FEBRUARY: DateRange = {
  start: new CalendarDate(2027, 2, 10),
  end: new CalendarDate(2027, 2, 20),
};

function callerValue(screen: Screen): string {
  return screen.getByTestId("caller-value").element().textContent ?? "";
}

for (const variant of ["register", "backoffice"] as const) {
  test(`draws the start, a dash and the end in one box with the calendar button ${variant === "register" ? "first" : "last"} in the ${variant} variant`, async () => {
    const screen = await render(<Harness variant={variant} initial={FEBRUARY} />);
    const group = fieldGroup(screen, "Period");

    expect(segmentsOf(group)).toHaveLength(6);
    expect(group.textContent).toContain("10");
    expect(group.textContent).toContain("–");
    expect(group.textContent).toContain("20");
    const button = group.querySelector("button") as HTMLElement;
    const edge = variant === "register" ? group.firstElementChild : group.lastElementChild;
    expect(edge?.contains(button)).toBe(true);
    expect(group.getBoundingClientRect().height).toBeCloseTo(variant === "register" ? 56 : 48, 0);
  });

  test(`shows a white box with a 2px line border at rest in the ${variant} variant`, async () => {
    const screen = await render(<Harness variant={variant} />);
    const group = fieldGroup(screen, "Period");

    expect(getComputedStyle(group).backgroundColor).toBe(tokenRgb("surface"));
    expect(paintedBoxShadowLayers(group)).toEqual([insetBoundary("border", "2px")]);
  });
}

for (const variant of ["register", "backoffice"] as const) {
  test(`keeps the dash and the end right after the start, leaving the free space after the end in the ${variant} variant`, async () => {
    const screen = await render(<Harness variant={variant} initial={FEBRUARY} />);
    const group = fieldGroup(screen, "Period");
    const segments = segmentsOf(group);
    const startEdge = (segments[2] as HTMLElement).getBoundingClientRect().right;
    const endStart = (segments[3] as HTMLElement).getBoundingClientRect().left;
    const endEdge = (segments[5] as HTMLElement).getBoundingClientRect().right;
    const groupRect = group.getBoundingClientRect();
    const buttonRect = (group.querySelector("button") as HTMLElement).getBoundingClientRect();

    expect(endStart - startEdge).toBeLessThan(40);
    const freeSpace =
      variant === "backoffice" ? buttonRect.left - endEdge : groupRect.right - endEdge;
    expect(freeSpace).toBeGreaterThan(64);
  });
}

test("reads a period typed day by day, the start first and then the end", async () => {
  const screen = await render(<Harness />);
  const group = fieldGroup(screen, "Period");

  await userEvent.click(segmentsOf(group)[0] as HTMLElement);
  await userEvent.keyboard("01022027");
  await userEvent.keyboard("28022027");

  await expect.poll(() => callerValue(screen)).toBe("2027-02-01..2027-02-28");
  await expectNoAccessibilityViolations(screen.container);
});

test("tells the caller nothing until both ends are complete", async () => {
  const screen = await render(<Harness />);
  const group = fieldGroup(screen, "Period");

  await userEvent.click(segmentsOf(group)[0] as HTMLElement);
  await userEvent.keyboard("01022027");

  expect(callerValue(screen)).toBe("");
});

test("tells the caller the period is empty once every segment of one end is erased", async () => {
  const screen = await render(<Harness initial={FEBRUARY} />);
  const group = fieldGroup(screen, "Period");

  for (const segment of segmentsOf(group).slice(3)) {
    await userEvent.click(segment);
    await userEvent.keyboard("{Backspace}{Backspace}{Backspace}{Backspace}");
  }

  await expect.poll(() => callerValue(screen)).toBe("");
});

test("opens one calendar on the period's first month with both ends chosen and the days between lighter", async () => {
  const screen = await render(<Harness initial={FEBRUARY} />);
  const dialog = await openCalendar(screen, "Period");

  const start = dayButton(dialog, "10");
  const between = dayButton(dialog, "15");
  const end = dayButton(dialog, "20");
  const outside = dayButton(dialog, "25");
  expect(start.getAttribute("data-selection-start")).toBe("true");
  expect(end.getAttribute("data-selection-end")).toBe("true");

  expect(getComputedStyle(start).backgroundColor).toBe(tokenRgb("action"));
  expect(getComputedStyle(end).backgroundColor).toBe(tokenRgb("action"));
  expect(getComputedStyle(start).color).toBe(tokenRgb("text-inverse"));
  expect(getComputedStyle(between).backgroundColor).toBe(tokenRgb("action-subtle"));
  expect(getComputedStyle(between).color).toBe(tokenRgb("text"));
  expect(getComputedStyle(outside).backgroundColor).not.toBe(tokenRgb("action-subtle"));
  expect(
    contrastRatio(
      rgbToHex(getComputedStyle(between).color),
      rgbToHex(getComputedStyle(between).backgroundColor),
    ),
  ).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);

  await expectNoAccessibilityViolations(document.body);
});

test("chooses a period by clicking its first day and then its last day, closing the calendar", async () => {
  const screen = await render(<Harness initial={FEBRUARY} />);
  const dialog = await openCalendar(screen, "Period");

  await userEvent.click(dayButton(dialog, "3"));
  await userEvent.click(dayButton(dialog, "17"));

  await expect.poll(() => screen.getByRole("dialog").elements().length).toBe(0);
  await expect.poll(() => callerValue(screen)).toBe("2027-02-03..2027-02-17");
  expect(fieldGroup(screen, "Period").textContent).toContain("17");
});

test("orders the ends when the last day is clicked before the first", async () => {
  const screen = await render(<Harness initial={FEBRUARY} />);
  const dialog = await openCalendar(screen, "Period");

  await userEvent.click(dayButton(dialog, "17"));
  await userEvent.click(dayButton(dialog, "3"));

  await expect.poll(() => callerValue(screen)).toBe("2027-02-03..2027-02-17");
  expect(
    screen.getByText("La fecha de fin no puede ser anterior a la de inicio.").query(),
  ).toBeNull();
});

test("accepts a period of one day by clicking the same day twice", async () => {
  const screen = await render(<Harness initial={FEBRUARY} />);
  const dialog = await openCalendar(screen, "Period");

  await userEvent.click(dayButton(dialog, "12"));
  await userEvent.click(dayButton(dialog, "12"));

  await expect.poll(() => callerValue(screen)).toBe("2027-02-12..2027-02-12");
  expect(
    screen.getByText("La fecha de fin no puede ser anterior a la de inicio.").query(),
  ).toBeNull();
});

test("chooses a period with the keyboard on the open calendar", async () => {
  const screen = await render(<Harness initial={FEBRUARY} />);
  const dialog = await openCalendar(screen, "Period");

  dayButton(dialog, "10").focus();
  await userEvent.keyboard("{Enter}");
  await userEvent.keyboard("{ArrowDown}");
  const lastDay = (dialog.querySelector('[data-focus-visible="true"]') as HTMLElement).textContent;
  await userEvent.keyboard("{Enter}");

  await expect.poll(() => callerValue(screen)).toBe(`2027-02-10..2027-02-${lastDay?.trim()}`);
  expect(Number(lastDay)).toBeGreaterThan(10);
});

test("moves the calendar between months and years with the shared header", async () => {
  const screen = await render(<Harness initial={FEBRUARY} />);
  const dialog = await openCalendar(screen, "Period");

  await userEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
  await userEvent.click(dayButton(dialog, "1"));
  await userEvent.click(dayButton(dialog, "2"));

  await expect.poll(() => callerValue(screen)).toBe("2027-03-01..2027-03-02");
});

test("names the calendar by its month and year", async () => {
  const screen = await render(<Harness initial={FEBRUARY} />);
  const dialog = await openCalendar(screen, "Period");

  const labelledBy = dialog.getAttribute("aria-labelledby") ?? "";
  expect(document.getElementById(labelledBy)?.textContent).toBe("Febrero 2027");
});

test("shows its own error under the field when a typed end is before the start", async () => {
  const screen = await render(<Harness />);
  const group = fieldGroup(screen, "Period");

  await userEvent.click(segmentsOf(group)[0] as HTMLElement);
  await userEvent.keyboard("28022027");
  await userEvent.keyboard("01022027");

  const message = screen.getByText("La fecha de fin no puede ser anterior a la de inicio.");
  await expect.element(message).toBeVisible();
  expect(getComputedStyle(message.element()).color).toBe(tokenRgb("error"));
  for (const segment of segmentsOf(group)) {
    expect(segment.getAttribute("aria-invalid")).toBe("true");
  }
  await expectNoAccessibilityViolations(screen.container);
});

test("draws a reversed period's box in the error UI", async () => {
  const screen = await render(<Harness initial={{ start: FEBRUARY.end, end: FEBRUARY.start }} />);

  expect(paintedBoxShadowLayers(fieldGroup(screen, "Period"))).toEqual([
    insetBoundary("error", "2px"),
  ]);
});

test("tells the caller a typed reversed period as typed, so the caller can refuse it", async () => {
  const screen = await render(<Harness />);
  const group = fieldGroup(screen, "Period");

  await userEvent.click(segmentsOf(group)[0] as HTMLElement);
  await userEvent.keyboard("28022027");
  await userEvent.keyboard("01022027");

  await expect.poll(() => callerValue(screen)).toBe("2027-02-28..2027-02-01");
});

test("clears its own error once the end is typed on or after the start", async () => {
  const screen = await render(<Harness initial={{ start: FEBRUARY.end, end: FEBRUARY.start }} />);
  const group = fieldGroup(screen, "Period");
  const message = "La fecha de fin no puede ser anterior a la de inicio.";
  await expect.element(screen.getByText(message)).toBeVisible();

  await userEvent.click(segmentsOf(group)[3] as HTMLElement);
  await userEvent.keyboard("25");

  await expect.poll(() => screen.getByText(message).query()).toBeNull();
});

test("shows the caller's message instead of its own reversed-period message", async () => {
  const screen = await render(
    <Harness
      initial={{ start: FEBRUARY.end, end: FEBRUARY.start }}
      errorMessage="Revisá el período."
    />,
  );

  await expect.element(screen.getByText("Revisá el período.")).toBeVisible();
  expect(
    screen.getByText("La fecha de fin no puede ser anterior a la de inicio.").query(),
  ).toBeNull();
});

test("shows the helper line until the field is invalid", async () => {
  const screen = await render(<Harness description="Ambos días se incluyen." />);
  await expect.element(screen.getByText("Ambos días se incluyen.")).toBeVisible();

  const invalid = await render(
    <Harness description="Otra ayuda." errorMessage="Ingresá el período." />,
  );
  expect(invalid.getByText("Otra ayuda.").query()).toBeNull();
  await expect.element(invalid.getByText("Ingresá el período.")).toBeVisible();
});

test("shows a required field's error on the single field, described by it", async () => {
  const screen = await render(<Harness required errorMessage="Ingresá el período." />);
  const group = fieldGroup(screen, "Period");

  await expect.element(screen.getByText("Ingresá el período.")).toBeVisible();
  expect(paintedBoxShadowLayers(group)).toEqual([insetBoundary("error", "2px")]);
  for (const segment of segmentsOf(group)) {
    expect(segment.getAttribute("aria-invalid")).toBe("true");
    expect(segment.getAttribute("aria-required")).toBe("true");
    expect(describedTextOf(segment)).toContain("Ingresá el período.");
  }
  await expectNoAccessibilityViolations(screen.container);
});

test("marks a required field with an asterisk", async () => {
  const screen = await render(<Harness required />);
  const label = screen.getByText("Period").element() as HTMLElement;

  expect(getComputedStyle(label, "::after").content).toContain("*");
});

test("exposes a field without an error as valid, described by nothing", async () => {
  const screen = await render(<Harness />);
  const group = fieldGroup(screen, "Period");

  expect(paintedBoxShadowLayers(group)).toEqual([insetBoundary("border", "2px")]);
  for (const segment of segmentsOf(group)) {
    expect(segment.getAttribute("aria-invalid")).not.toBe("true");
    expect(describedTextOf(segment)).toBe("");
  }
});

function SharedMessageHarness() {
  const messageId = useId();
  return (
    <>
      <DateRangeField
        name="period"
        label="Period"
        value={null}
        onChange={() => {}}
        errorMessageId={messageId}
      />
      <p id={messageId}>Shared by another field.</p>
    </>
  );
}

test("is invalid and described by a message rendered elsewhere through errorMessageId", async () => {
  const screen = await render(<SharedMessageHarness />);
  const group = fieldGroup(screen, "Period");

  expect(paintedBoxShadowLayers(group)).toEqual([insetBoundary("error", "2px")]);
  for (const segment of segmentsOf(group)) {
    expect(segment.getAttribute("aria-invalid")).toBe("true");
    expect(describedTextOf(segment)).toContain("Shared by another field.");
  }
});

test("dims the whole field and blocks focus when disabled", async () => {
  const screen = await render(
    <>
      <Harness disabled />
      <button type="button">Next control</button>
    </>,
  );
  const group = fieldGroup(screen, "Period");

  expect(getComputedStyle(group.parentElement as HTMLElement).opacity).toBe("0.45");
  await userEvent.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Next control" }).element(),
  );
});

const BOUNDS = {
  minValue: new CalendarDate(2027, 2, 1),
  maxValue: new CalendarDate(2027, 2, 28),
  rangeMessage: "El período debe ser de febrero de 2027.",
};

test("shows the range message when an end of the period is outside the allowed days", async () => {
  const screen = await render(
    <Harness
      bounds={BOUNDS}
      initial={{ start: new CalendarDate(2027, 2, 20), end: new CalendarDate(2027, 3, 2) }}
    />,
  );

  await expect.element(screen.getByText(BOUNDS.rangeMessage)).toBeVisible();
  expect(paintedBoxShadowLayers(fieldGroup(screen, "Period"))).toEqual([
    insetBoundary("error", "2px"),
  ]);
});

test("accepts a period inside the allowed days, ends included", async () => {
  const screen = await render(
    <Harness bounds={BOUNDS} initial={{ start: BOUNDS.minValue, end: BOUNDS.maxValue }} />,
  );

  expect(screen.getByText(BOUNDS.rangeMessage).query()).toBeNull();
});

test("does not let the calendar pick a day outside the allowed days", async () => {
  const screen = await render(<Harness bounds={BOUNDS} initial={FEBRUARY} />);
  const dialog = await openCalendar(screen, "Period");

  expect(
    screen.getByRole("button", { name: "Mes anterior" }).element().getAttribute("data-disabled"),
  ).toBe("true");
  expect(
    screen.getByRole("button", { name: "Mes siguiente" }).element().getAttribute("data-disabled"),
  ).toBe("true");
  expect(dayButton(dialog, "28").getAttribute("data-disabled")).toBeNull();
});

test("announces the field as a group named by its label, with its ends through the segments", async () => {
  const screen = await render(<Harness initial={FEBRUARY} />);
  const group = fieldGroup(screen, "Period");

  expect(group.getAttribute("aria-labelledby")).toBeTruthy();
  const texts = segmentsOf(group).map((segment) => segment.getAttribute("aria-valuetext") ?? "");
  expect(texts.some((text) => text.includes("10"))).toBe(true);
  expect(texts.some((text) => text.includes("20"))).toBe(true);
  expect(texts.filter((text) => text.toLowerCase().includes("febrero"))).toHaveLength(2);
});

test("names its calendar button after its own field", async () => {
  const screen = await render(<Harness label="Vigencia" />);

  await expect
    .element(screen.getByRole("button", { name: "Abrir el calendario de Vigencia" }))
    .toBeVisible();
});

test("names every native input it renders for form submission after the field", async () => {
  const screen = await render(<Harness initial={FEBRUARY} />);
  const names = [...screen.container.querySelectorAll("input")].map((input) =>
    input.getAttribute("name"),
  );

  expect(names.sort()).toEqual(["period-end", "period-start"]);
});

test("names the calendar's month and year selects after the field's name", async () => {
  const screen = await render(<Harness initial={FEBRUARY} />);
  await openCalendar(screen, "Period");

  const names = [...document.querySelectorAll("select")].map((select) =>
    select.getAttribute("name"),
  );
  expect(names.sort()).toEqual(["period-calendar-month", "period-calendar-year"]);
});

test("accepts a bound without its message only as a type error", () => {
  expectTypeOf<DateRangeFieldProps["name"]>().toEqualTypeOf<string>();
  expectTypeOf<DateRangeFieldProps["value"]>().toEqualTypeOf<DateRange | null>();
  expectTypeOf<{
    name: string;
    label: string;
    value: null;
    onChange: () => void;
    minValue: CalendarDate;
  }>().not.toExtend<DateRangeFieldProps>();
  expectTypeOf<{
    name: string;
    label: string;
    value: null;
    onChange: () => void;
    errorMessage: string;
    errorMessageId: string;
  }>().not.toExtend<DateRangeFieldProps>();
});
