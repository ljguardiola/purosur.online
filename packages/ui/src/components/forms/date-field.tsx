import type { CalendarDate } from "@internationalized/date";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useId } from "react";
import {
  Button as AriaButton,
  Calendar as AriaCalendar,
  CalendarCell as AriaCalendarCell,
  CalendarGrid as AriaCalendarGrid,
  CalendarGridBody as AriaCalendarGridBody,
  CalendarGridHeader as AriaCalendarGridHeader,
  CalendarHeaderCell as AriaCalendarHeaderCell,
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
import type { Locale } from "../../messages/formatters";
import { iconSlotClassName } from "../shared/icon";
import {
  backofficeFieldBoxClassName,
  backofficeFieldValueClassName,
  fieldLabelClassName,
  fieldWrapperGapClassName,
  requiredFieldLabelSuffixClassName,
  useFieldSize,
} from "./field-size";

// CalendarDate's constructor constrains an invalid day, such as February 30th, to the month's
// real last day instead of refusing it, so no caller value can reach here unparseable.
type DateFieldCommonProps = {
  label: string;
  value: CalendarDate | null;
  onChange: (value: CalendarDate | null) => void;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
};

type DateFieldValidityProps =
  | { invalid: true; errorMessage: string }
  | { invalid?: false; errorMessage?: undefined };

type DateFieldRangeProps =
  | { minValue?: undefined; maxValue?: undefined; rangeMessage?: undefined }
  | { minValue: CalendarDate; maxValue?: CalendarDate; rangeMessage: string }
  | { minValue?: CalendarDate; maxValue: CalendarDate; rangeMessage: string };

export type DateFieldProps = DateFieldCommonProps & DateFieldValidityProps & DateFieldRangeProps;

const LOCALE: Locale = "es-AR";

const wrapperBaseClassName = "flex flex-col data-disabled:opacity-disabled";

const boxBaseClassName = "flex items-center rounded-lg outline-none";

const registerFrameClassName = "h-control-4xl gap-2 px-4";
const registerValueClassName = "text-heading text-text";

const inputBaseClassName = "flex min-w-0 flex-1 outline-none";

// The focused segment gets its own fill because the box's focus shadow doesn't move with the
// active segment and this field draws no caret, so nothing else marks which segment is next.
// `not-data-focused` keeps the placeholder tone from losing to the focused segment's color
// regardless of the two Tailwind rules' generated order.
const segmentClassName =
  "rounded-sm outline-none " +
  "data-placeholder:not-data-focused:text-text-subtle " +
  "data-focused:bg-action data-focused:text-text-inverse";

// react-aria never marks a literal `/` segment as a placeholder (`data-placeholder` follows
// `segment.isPlaceholder`, which a literal never is), so without this rule it would keep its
// full-strength tone between dimmed digits even while the field holds no date.
const emptySeparatorClassName = "literal:text-text-subtle";

// WCAG 2.5.8 requires a 24x24 CSS px pointer target; the 18px glyph the design draws is under
// that minimum on a touch-screen register. The negative margin pulls the extra 3px per side back
// out of the flex layout so the glyph's own edge still lands on the box's padding.
const iconButtonClassName =
  "inline-flex size-6 shrink-0 -mx-0.75 items-center justify-center text-text-subtle outline-none " +
  "data-focus-visible:focus-ring";

const helperClassName = "text-detail text-text-subtle";
const errorClassName = "text-detail text-error";

function boxStateClassName(disabled: boolean, invalid: boolean): string {
  if (disabled) {
    return "bg-surface inset-ring-2 inset-ring-border";
  }
  if (invalid) {
    return (
      "bg-surface inset-ring-2 inset-ring-error " +
      "hover:not-focus-within:bg-surface-subtle " +
      "focus-within:inset-ring-action"
    );
  }
  return (
    "bg-surface inset-ring-2 inset-ring-border " +
    "hover:not-focus-within:bg-surface-subtle " +
    "focus-within:inset-ring-action"
  );
}

const popoverClassName = "outline-none";
const dialogClassName =
  "flex flex-col gap-3 rounded-lg bg-surface p-4 inset-ring-1 inset-ring-border-strong outline-none";
const calendarHeaderClassName = "flex items-center justify-between gap-2";
const calendarHeadingClassName = "text-body font-bold text-text capitalize";
const calendarNavButtonClassName =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-text-subtle outline-none " +
  "data-hovered:bg-surface-subtle " +
  "data-disabled:opacity-disabled " +
  "data-focus-visible:focus-ring";
// A focused day's outline ring reaches 6px past its cell (3px width + 3px offset); border-collapse
// would let that ring paint over the neighbouring cell's fill and drop its contrast under 2:1.
const calendarGridClassName = "border-separate border-spacing-1.5";
const calendarWeekdayClassName = "size-control-sm text-detail text-text-subtle";
const calendarCellClassName =
  "size-control-sm rounded-md text-center align-middle text-body text-text outline-none " +
  "data-hovered:bg-surface-subtle " +
  "data-selected:bg-action data-selected:text-text-inverse data-selected:font-bold " +
  "data-disabled:pointer-events-none data-disabled:opacity-disabled " +
  "data-outside-month:invisible " +
  "data-focus-visible:focus-ring";

function CalendarToggleButton() {
  return (
    <AriaButton className={iconButtonClassName}>
      <span aria-hidden="true" className={iconSlotClassName.md}>
        <CalendarIcon />
      </span>
    </AriaButton>
  );
}

export function DateField(props: DateFieldProps) {
  const { label, value, onChange, helperText, disabled = false, required = false } = props;
  const size = useFieldSize();
  const errorMessage = props.invalid ? props.errorMessage : undefined;
  // react-aria-components' Dialog defaults to the field's own label for its aria-labelledby;
  // this overrides it to the calendar heading instead.
  const calendarHeadingId = useId();
  const minValue = props.minValue ?? null;
  const maxValue = props.maxValue ?? null;
  const rangeMessage = props.rangeMessage;

  // WCAG 1.4.3/1.4.11 exempt an inactive component's own text from the contrast minimum, but
  // axe-core's color-contrast check only honors that exemption on a node whose own `aria-disabled`
  // says so; the wrapper's opacity dip doesn't qualify. react-aria-components' DatePicker root
  // filters out `aria-disabled` from forwarded DOM props, so it's set directly on these elements.
  const disabledTextProps = disabled ? { "aria-disabled": true as const } : {};

  const outOfRange =
    value !== null &&
    ((minValue !== null && value.compare(minValue) < 0) ||
      (maxValue !== null && value.compare(maxValue) > 0));
  const shownError = errorMessage ?? (outOfRange ? rangeMessage : undefined);
  const invalid = shownError !== undefined;
  const labelClassName = fieldLabelClassName[size];
  const frameClassName =
    size === "backoffice" ? backofficeFieldBoxClassName : registerFrameClassName;
  const valueClassName =
    size === "backoffice" ? backofficeFieldValueClassName : registerValueClassName;

  return (
    <I18nProvider locale={LOCALE}>
      <AriaDatePicker<CalendarDate>
        value={value}
        onChange={onChange}
        isDisabled={disabled}
        isInvalid={invalid}
        isRequired={required}
        minValue={minValue}
        maxValue={maxValue}
        className={`${wrapperBaseClassName} ${fieldWrapperGapClassName[size]}`}
      >
        <AriaLabel
          className={
            required ? `${labelClassName} ${requiredFieldLabelSuffixClassName}` : labelClassName
          }
        >
          {label}
        </AriaLabel>
        <AriaGroup
          className={`${boxBaseClassName} ${frameClassName} ${boxStateClassName(disabled, invalid)}`}
        >
          {size === "register" && <CalendarToggleButton />}
          <AriaDateInput className={`${inputBaseClassName} ${valueClassName}`}>
            {(segment) => (
              <AriaDateSegment
                segment={segment}
                className={
                  value === null
                    ? `${segmentClassName} ${emptySeparatorClassName}`
                    : segmentClassName
                }
              />
            )}
          </AriaDateInput>
          {size === "backoffice" && <CalendarToggleButton />}
        </AriaGroup>
        {shownError !== undefined ? (
          <AriaText slot="errorMessage" className={errorClassName} {...disabledTextProps}>
            {shownError}
          </AriaText>
        ) : (
          helperText !== undefined && (
            <AriaText slot="description" className={helperClassName} {...disabledTextProps}>
              {helperText}
            </AriaText>
          )
        )}
        <AriaPopover className={popoverClassName}>
          <AriaDialog aria-labelledby={calendarHeadingId} className={dialogClassName}>
            <AriaCalendar minValue={minValue} maxValue={maxValue}>
              <header className={calendarHeaderClassName}>
                <AriaButton slot="previous" className={calendarNavButtonClassName}>
                  <span aria-hidden="true" className={iconSlotClassName.md}>
                    <ChevronLeft />
                  </span>
                </AriaButton>
                <AriaHeading id={calendarHeadingId} className={calendarHeadingClassName} />
                <AriaButton slot="next" className={calendarNavButtonClassName}>
                  <span aria-hidden="true" className={iconSlotClassName.md}>
                    <ChevronRight />
                  </span>
                </AriaButton>
              </header>
              <AriaCalendarGrid className={calendarGridClassName}>
                <AriaCalendarGridHeader>
                  {(weekday) => (
                    <AriaCalendarHeaderCell className={calendarWeekdayClassName}>
                      {weekday}
                    </AriaCalendarHeaderCell>
                  )}
                </AriaCalendarGridHeader>
                <AriaCalendarGridBody>
                  {(date) => <AriaCalendarCell date={date} className={calendarCellClassName} />}
                </AriaCalendarGridBody>
              </AriaCalendarGrid>
            </AriaCalendar>
          </AriaDialog>
        </AriaPopover>
      </AriaDatePicker>
    </I18nProvider>
  );
}
