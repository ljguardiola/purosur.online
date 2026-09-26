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
import type { Locale } from "../messages/formatters";
import {
  backofficeFieldBoxClassName,
  backofficeFieldValueClassName,
  fieldLabelClassName,
  fieldWrapperGapClassName,
  requiredFieldLabelSuffixClassName,
  useFieldSize,
} from "./FieldSize";

// The date is a calendar date, never text: a CalendarDate can only ever hold a day that exists
// (its own constructor constrains February 30th to the 28th rather than refusing it), so no
// caller value can reach this component as something it would have to parse and could fail on.
type DateFieldCommonProps = {
  label: string;
  // `null` when no date is chosen.
  value: CalendarDate | null;
  onChange: (value: CalendarDate | null) => void;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
};

// An invalid field always names why, the same discipline as TextField.tsx's own
// TextFieldValidityProps. The caller's message wins over the range message when both apply.
type DateFieldValidityProps =
  | { invalid: true; errorMessage: string }
  | { invalid?: false; errorMessage?: undefined };

// An allowed range always names why it refuses a date outside it: there is no min/max without the
// message the field shows in its place (see TextField.tsx's own TextFieldValidityProps for the
// same discipline).
type DateFieldRangeProps =
  | { minValue?: undefined; maxValue?: undefined; rangeMessage?: undefined }
  | { minValue: CalendarDate; maxValue?: CalendarDate; rangeMessage: string }
  | { minValue?: CalendarDate; maxValue: CalendarDate; rangeMessage: string };

export type DateFieldProps = DateFieldCommonProps & DateFieldValidityProps & DateFieldRangeProps;

// The value reads as day, month and a four-digit year, and the calendar's month names are
// Spanish, in both apps this package serves; see packages/ui/src/messages/formatters.ts.
const LOCALE: Locale = "es-AR";

const wrapperBaseClassName = "flex flex-col data-[disabled]:opacity-[0.45]";

const boxBaseClassName = "flex items-center rounded-lg outline-none";

// This field's own long-standing register frame and value; the backoffice ones are FieldSize.tsx's
// own shared backofficeFieldBoxClassName and backofficeFieldValueClassName.
const registerFrameClassName = "h-14 gap-2 px-4";
const registerValueClassName = "text-xl font-bold text-ink";

const inputBaseClassName = "flex min-w-0 flex-1 outline-none";

// A placeholder segment drawn in the value's own tone makes an empty field read as one already
// holding a date, so it dims to the secondary tone the way SearchField.tsx's own placeholder does.
// The focused segment carries a fill of its own because the box's focus shadow is identical
// whichever segment is active and this field draws no caret: the fill and its white text are the
// same pair the calendar already uses for the chosen day, whose contrast is checked there too.
// `not-data-[focused]` keeps the placeholder tone from ever winning over the focused segment's
// own text color, regardless of the order the two rules compile in.
const segmentClassName =
  "rounded-sm outline-none " +
  "data-[placeholder]:not-data-[focused]:text-ink-secondary " +
  "data-[focused]:bg-brand-blue-ui data-[focused]:text-surface-white";

// The `/` separators are literal segments, not editable ones, so react-aria never marks them as
// placeholders (`data-placeholder` follows `segment.isPlaceholder`, which a literal never is) and
// they keep the value's own full-strength tone. Dimmed digits between near-black slashes are not
// the placeholder the rule above is asking for, so while the field holds no date the separators
// take the same tone: `data-type` is set on every segment, literals included, and a literal is
// never the focused segment, so this leaves the focused segment's own treatment alone.
const emptySeparatorClassName = "data-[type=literal]:text-ink-secondary";

// IconButton.tsx's own wrapping technique, both halves of it: the button is the pointer target
// and an inner wrapper's CSS size is what draws the glyph, regardless of the icon's own markup.
// WCAG 2.5.8 sets 24x24 CSS px as the minimum target, and the 18px the design draws for the glyph
// is well under it on a touch-screen register, so the button is 24px square and the glyph keeps
// its 18px inside it — small enough to sit inside both the 56px and 48px box heights untouched.
// That target is 3px wider than the glyph on each side, and the design's horizontal metrics are
// the glyph's, not the target's: the negative margin takes those 3px back out of the flex layout
// on both sides, so the glyph's own edge lands on the box's padding and the value starts one gap
// past the glyph, while the button a finger aims at stays 24px square.
// The calendar toggle button is a real tab stop of its own, so it carries the package's own
// outline focus ring (see Button.tsx's own baseClassName). It sits inside the box, whose
// focus-within shadow it therefore lights up too: both are drawn at once, the ring naming the
// button and the shadow saying the field as a whole holds focus.
const iconButtonClassName =
  "inline-flex size-6 shrink-0 -mx-[3px] items-center justify-center text-ink-secondary outline-none " +
  "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-3 data-[focus-visible]:outline-brand-blue-strong";
const iconGlyphClassName = "inline-flex size-[1.125rem] shrink-0 [&>svg]:h-full [&>svg]:w-full";

const helperClassName = "text-sm font-normal text-ink-secondary";
const errorClassName = "text-sm font-normal text-status-error-ui";

// The box's own border and shadow per interaction state, drawn with the same inset-shadow
// technique and the same line/brand-blue-ui border system as TextField.tsx (see its own
// boxStateClassName for why).
function boxStateClassName(disabled: boolean, invalid: boolean): string {
  if (disabled) {
    return "bg-surface-white shadow-[inset_0_0_0_2px_var(--color-line)]";
  }
  if (invalid) {
    return (
      "bg-surface-white shadow-[inset_0_0_0_2px_var(--color-status-error-ui)] " +
      "hover:not-focus-within:bg-surface-bone " +
      "focus-within:shadow-[inset_0_0_0_2px_var(--color-brand-blue-ui)]"
    );
  }
  return (
    "bg-surface-white shadow-[inset_0_0_0_2px_var(--color-line)] " +
    "hover:not-focus-within:bg-surface-bone " +
    "focus-within:shadow-[inset_0_0_0_2px_var(--color-brand-blue-ui)]"
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
  "data-[disabled]:opacity-[0.45] " +
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
// The weekday abbreviations name the columns rather than carrying the calendar's own content, so
// they take the package's supporting-text scale and tone (the same pair helperClassName uses)
// instead of inheriting whatever typography the surrounding page happens to set.
const calendarWeekdayClassName = "size-9 text-sm font-normal text-ink-secondary";
const calendarCellClassName =
  "size-9 rounded-md text-center align-middle text-base text-ink outline-none " +
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
    <AriaButton className={iconButtonClassName}>
      <span aria-hidden="true" className={iconGlyphClassName}>
        <CalendarIcon />
      </span>
    </AriaButton>
  );
}

export function DateField(props: DateFieldProps) {
  const { label, value, onChange, helperText, disabled = false, required = false } = props;
  const size = useFieldSize();
  const errorMessage = props.invalid ? props.errorMessage : undefined;
  // Names the open calendar's own dialog by the month and year it shows, instead of react-aria's
  // own default of reusing the field's label: that label already names the field itself.
  const calendarHeadingId = useId();
  const minValue = props.minValue ?? null;
  const maxValue = props.maxValue ?? null;
  const rangeMessage = props.rangeMessage;

  // WCAG's contrast minimum explicitly doesn't apply to an inactive component's own text
  // (1.4.3/1.4.11), and axe-core's own color-contrast check only honors that exemption for a node
  // whose OWN `aria-disabled` (or an ancestor's) says so — the wrapper's opacity dip doesn't
  // qualify. react-aria-components' DatePicker root only forwards a fixed allowlist of DOM props
  // (see its own filterDOMProps), which excludes `aria-disabled`, so it is set directly on the
  // text elements that need the exemption, exactly as TextField.tsx already does.
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
