import { type CalendarDate, parseDate } from "@internationalized/date";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useId } from "react";
import {
  Button as AriaButton,
  Calendar as AriaCalendar,
  CalendarCell as AriaCalendarCell,
  CalendarGrid as AriaCalendarGrid,
  DateInput as AriaDateInput,
  DatePicker as AriaDatePicker,
  DateSegment as AriaDateSegment,
  Dialog as AriaDialog,
  Group as AriaGroup,
  Heading as AriaHeading,
  Label as AriaLabel,
  Popover as AriaPopover,
  Text as AriaText,
  I18nProvider,
} from "react-aria-components";
import type { Locale } from "../messages/formatters";

export type DateFieldVariant = "register" | "backoffice";

type DateFieldCommonProps = {
  variant: DateFieldVariant;
  label: string;
  // ISO 8601 "YYYY-MM-DD", or "" when no date is chosen.
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
  disabled?: boolean;
};

// An allowed range always names why it refuses a date outside it: there is no min/max without the
// message the field shows in its place (see TextField.tsx's own TextFieldValidityProps for the
// same discipline).
type DateFieldRangeProps =
  | { minValue?: undefined; maxValue?: undefined; rangeMessage?: undefined }
  | { minValue: string; maxValue?: string; rangeMessage: string }
  | { minValue?: string; maxValue: string; rangeMessage: string };

export type DateFieldProps = DateFieldCommonProps & DateFieldRangeProps;

// The value reads as day, month and a four-digit year, and the calendar's month names are
// Spanish, in both apps this package serves; see packages/ui/src/messages/formatters.ts.
const LOCALE: Locale = "es-AR";

function parseValue(value: string): CalendarDate | null {
  return value === "" ? null : parseDate(value);
}

const wrapperBaseClassName = "flex flex-col data-[disabled]:opacity-[0.45]";

// The label-to-box gap per variant, as design.pen draws it: 6px for the "Vencimiento" frame
// (Vf9w7), 4px for every compact "Fecha" frame (MEucn, tUUXc, y0uNJ, P0EsW0).
const wrapperGapClassName: Record<DateFieldVariant, string> = {
  register: "gap-1.5",
  backoffice: "gap-1",
};

const registerLabelClassName = "text-base font-bold text-ink";
const backofficeLabelClassName = "text-sm font-bold text-ink-secondary";

const boxBaseClassName = "flex items-center rounded-lg outline-none";

const frameClassName: Record<DateFieldVariant, string> = {
  register: "h-14 gap-2 px-4",
  backoffice: "h-12 gap-2 px-3",
};

const valueClassName: Record<DateFieldVariant, string> = {
  register: "text-xl font-bold text-ink",
  backoffice: "text-base font-semibold text-ink",
};

const inputBaseClassName = "flex min-w-0 flex-1 outline-none";

// Sized to the 18px the design draws, following IconButton.tsx's own wrapping technique: the
// wrapper's CSS size is what actually renders, regardless of the icon's own markup. The calendar
// toggle button is a real tab stop of its own, so it carries the package's own outline focus ring
// (see Button.tsx's own baseClassName) rather than the field's inset shadow, which belongs to the
// box as a whole.
const iconWrapperClassName =
  "inline-flex size-[1.125rem] shrink-0 text-ink-secondary outline-none [&>svg]:h-full [&>svg]:w-full " +
  "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-3 data-[focus-visible]:outline-brand-blue-strong";

const helperClassName = "text-sm font-normal text-ink-secondary";
const errorClassName = "text-sm font-normal text-status-error-ui";

// The box's own border and shadow per interaction state, the same inset-shadow system TextField.tsx
// and SearchField.tsx already use (see TextField.tsx's own boxStateClassName for why).
function boxStateClassName(disabled: boolean, invalid: boolean): string {
  if (disabled) {
    return "bg-surface-white shadow-[inset_0_0_0_2px_var(--color-ink-secondary)]";
  }
  if (invalid) {
    return (
      "bg-surface-white shadow-[inset_0_0_0_2px_var(--color-status-error-ui)] " +
      "hover:not-focus-within:bg-surface-bone " +
      "focus-within:shadow-[inset_0_0_0_3px_var(--color-brand-blue-strong),0_0_0_4px_var(--color-brand-blue-ui-shadow)]"
    );
  }
  return (
    "bg-surface-white shadow-[inset_0_0_0_2px_var(--color-ink-secondary)] " +
    "hover:not-focus-within:bg-surface-bone " +
    "focus-within:shadow-[inset_0_0_0_3px_var(--color-brand-blue-strong),0_0_0_4px_var(--color-brand-blue-ui-shadow)]"
  );
}

const popoverClassName = "outline-none";
const dialogClassName =
  "flex flex-col gap-3 rounded-lg bg-surface-white p-4 shadow-[inset_0_0_0_1px_var(--color-ink-secondary)] outline-none";
const calendarHeaderClassName = "flex items-center justify-between gap-2";
const calendarHeadingClassName = "text-base font-bold text-ink capitalize";
const calendarNavButtonClassName =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-secondary outline-none " +
  "data-[hovered]:bg-surface-bone " +
  "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-3 data-[focus-visible]:outline-brand-blue-strong";
const calendarNavIconClassName =
  "inline-flex size-[1.125rem] shrink-0 [&>svg]:h-full [&>svg]:w-full";
// Separate, not collapsed: a keyboard-focused day's own outline ring reaches 6px past its cell
// (3px width + 3px offset), and a collapsed grid has no room for that ring before it paints over
// the neighbouring cell's own fill — including the chosen day's blue-ui fill, which drops the
// ring's brand-blue-strong color to under 2:1 contrast against it. 6px of real spacing (the
// package's 1.5 step) keeps the ring inside its own cell's gap on every side.
const calendarGridClassName = "border-separate border-spacing-1.5";
const calendarCellClassName =
  "size-9 cursor-default rounded-md text-center align-middle text-base text-ink outline-none " +
  "data-[hovered]:bg-surface-bone " +
  "data-[selected]:bg-brand-blue-ui data-[selected]:text-surface-white data-[selected]:font-bold " +
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-[0.45] " +
  "data-[outside-month]:invisible " +
  "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-3 data-[focus-visible]:outline-brand-blue-strong";

// The single calendar icon drawn on the field is the calendar toggle button itself: there is no
// separate decorative icon beside it.
function CalendarToggleButton() {
  return (
    <AriaButton className={iconWrapperClassName}>
      <CalendarIcon aria-hidden="true" />
    </AriaButton>
  );
}

export function DateField(props: DateFieldProps) {
  const { variant, label, value, onChange, helperText, disabled = false } = props;
  // Names the open calendar's own dialog by the month and year it shows, instead of react-aria's
  // own default of reusing the field's label: that label already names the field itself.
  const calendarHeadingId = useId();
  const minValue = props.minValue !== undefined ? parseValue(props.minValue) : null;
  const maxValue = props.maxValue !== undefined ? parseValue(props.maxValue) : null;
  const rangeMessage = props.rangeMessage;

  const dateValue = parseValue(value);
  const outOfRange =
    dateValue !== null &&
    ((minValue !== null && dateValue.compare(minValue) < 0) ||
      (maxValue !== null && dateValue.compare(maxValue) > 0));

  function handleChange(next: CalendarDate | null) {
    onChange(next ? next.toString() : "");
  }

  return (
    <I18nProvider locale={LOCALE}>
      <AriaDatePicker
        value={dateValue}
        onChange={handleChange}
        isDisabled={disabled}
        isInvalid={outOfRange}
        minValue={minValue}
        maxValue={maxValue}
        className={`${wrapperBaseClassName} ${wrapperGapClassName[variant]}`}
      >
        <AriaLabel
          className={variant === "register" ? registerLabelClassName : backofficeLabelClassName}
        >
          {label}
        </AriaLabel>
        <AriaGroup
          className={`${boxBaseClassName} ${frameClassName[variant]} ${boxStateClassName(disabled, outOfRange)}`}
        >
          {variant === "register" && <CalendarToggleButton />}
          <AriaDateInput className={`${inputBaseClassName} ${valueClassName[variant]}`}>
            {(segment) => <AriaDateSegment segment={segment} className="outline-none" />}
          </AriaDateInput>
          {variant === "backoffice" && <CalendarToggleButton />}
        </AriaGroup>
        {outOfRange ? (
          <AriaText slot="errorMessage" className={errorClassName}>
            {rangeMessage}
          </AriaText>
        ) : (
          helperText !== undefined && (
            <AriaText slot="description" className={helperClassName}>
              {helperText}
            </AriaText>
          )
        )}
        <AriaPopover className={popoverClassName}>
          <AriaDialog aria-labelledby={calendarHeadingId} className={dialogClassName}>
            <AriaCalendar minValue={minValue} maxValue={maxValue}>
              <header className={calendarHeaderClassName}>
                <AriaButton slot="previous" className={calendarNavButtonClassName}>
                  <span aria-hidden="true" className={calendarNavIconClassName}>
                    <ChevronLeft />
                  </span>
                </AriaButton>
                <AriaHeading id={calendarHeadingId} className={calendarHeadingClassName} />
                <AriaButton slot="next" className={calendarNavButtonClassName}>
                  <span aria-hidden="true" className={calendarNavIconClassName}>
                    <ChevronRight />
                  </span>
                </AriaButton>
              </header>
              <AriaCalendarGrid className={calendarGridClassName}>
                {(date) => <AriaCalendarCell date={date} className={calendarCellClassName} />}
              </AriaCalendarGrid>
            </AriaCalendar>
          </AriaDialog>
        </AriaPopover>
      </AriaDatePicker>
    </I18nProvider>
  );
}
