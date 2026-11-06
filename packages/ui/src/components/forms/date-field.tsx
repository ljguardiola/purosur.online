import type { CalendarDate } from "@internationalized/date";
import { Calendar as CalendarIcon } from "lucide-react";
import { useId } from "react";
import {
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
  Label as AriaLabel,
  Popover as AriaPopover,
  Text as AriaText,
  I18nProvider,
} from "react-aria-components";
import type { Locale } from "../../messages/formatters";
import { iconSlotClassName } from "../shared/icon";
import { IconOnlyButton } from "../shared/icon-only-button";
import { CalendarHeader } from "./calendar-header";
import { type FieldErrorProps, fieldError } from "./field-error";
import {
  backofficeFieldBoxClassName,
  backofficeFieldValueClassName,
  fieldLabelClassName,
  fieldWrapperGapClassName,
  requiredFieldLabelSuffixClassName,
  useFieldSize,
} from "./field-size";
import {
  disabledTextProps,
  fieldBoxClassName,
  fieldBoxStateClassName,
  fieldErrorClassName,
  fieldHelperClassName,
  fieldWrapperClassName,
  menuPopoverStyle,
  menuSurfaceClassName,
} from "./field-styles";

// CalendarDate's constructor constrains an invalid day, such as February 30th, to the month's
// real last day instead of refusing it, so no caller value can reach here unparseable.
type DateFieldCommonProps = {
  name: string;
  label: string;
  value: CalendarDate | null;
  onChange: (value: CalendarDate | null) => void;
  description?: string;
  disabled?: boolean;
  required?: boolean;
};

type DateFieldRangeProps =
  | { minValue?: undefined; maxValue?: undefined; rangeMessage?: undefined }
  | { minValue: CalendarDate; maxValue?: CalendarDate; rangeMessage: string }
  | { minValue?: CalendarDate; maxValue: CalendarDate; rangeMessage: string };

export type DateFieldProps = DateFieldCommonProps & FieldErrorProps & DateFieldRangeProps;

const LOCALE: Locale = "es-AR";

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

const popoverClassName = `outline-none ${menuSurfaceClassName}`;
const dialogClassName = "flex flex-col gap-3 p-4 outline-none";
// A focused day's outline ring reaches 5px past its cell (3px width + 2px offset), one pixel into
// the neighbouring cell across the 4px gap; border-collapse would let it paint over that cell's
// fill entirely and drop its contrast under 2:1.
const calendarGridClassName = "border-separate border-spacing-1";
const calendarWeekdayClassName = "h-8 text-detail font-bold text-text-subtle";
const calendarCellClassName =
  "flex size-control-lg items-center justify-center rounded-md text-body text-text outline-none " +
  "data-hovered:bg-surface-subtle " +
  "data-today:font-bold data-today:inset-ring-2 data-today:inset-ring-action " +
  "data-selected:bg-action data-selected:text-text-inverse data-selected:font-bold " +
  "data-disabled:pointer-events-none data-disabled:opacity-disabled " +
  "data-outside-month:invisible " +
  "data-focus-visible:focus-ring-tight";

function CalendarToggleButton({ label, disabled }: { label: string; disabled: boolean }) {
  return (
    <IconOnlyButton
      name={`Abrir el calendario de ${label}`}
      disabled={disabled}
      className={iconButtonClassName}
    >
      <span aria-hidden="true" className={iconSlotClassName.md}>
        <CalendarIcon />
      </span>
    </IconOnlyButton>
  );
}

export function DateField(props: DateFieldProps) {
  const { name, label, value, onChange, description, disabled = false, required = false } = props;
  const size = useFieldSize();
  const { errorMessage, errorMessageId } = fieldError(props);
  // react-aria-components' Dialog defaults to the field's own label for its aria-labelledby;
  // this overrides it to the calendar's month and year instead.
  const calendarTitleId = useId();
  const minValue = props.minValue ?? null;
  const maxValue = props.maxValue ?? null;
  const rangeMessage = props.rangeMessage;

  const outOfRange =
    value !== null &&
    ((minValue !== null && value.compare(minValue) < 0) ||
      (maxValue !== null && value.compare(maxValue) > 0));
  const shownError = errorMessage ?? (outOfRange ? rangeMessage : undefined);
  const invalid = shownError !== undefined || errorMessageId !== undefined;
  const labelClassName = fieldLabelClassName[size];
  const frameClassName =
    size === "backoffice" ? backofficeFieldBoxClassName : registerFrameClassName;
  const valueClassName =
    size === "backoffice" ? backofficeFieldValueClassName : registerValueClassName;

  return (
    <I18nProvider locale={LOCALE}>
      <AriaDatePicker<CalendarDate>
        name={name}
        value={value}
        onChange={onChange}
        isDisabled={disabled}
        isInvalid={invalid}
        isRequired={required}
        {...(errorMessageId !== undefined ? { "aria-describedby": errorMessageId } : {})}
        minValue={minValue}
        maxValue={maxValue}
        className={`${fieldWrapperClassName} ${fieldWrapperGapClassName[size]}`}
      >
        <AriaLabel
          className={
            required ? `${labelClassName} ${requiredFieldLabelSuffixClassName}` : labelClassName
          }
        >
          {label}
        </AriaLabel>
        <AriaGroup
          className={`${fieldBoxClassName} ${frameClassName} ${fieldBoxStateClassName({ disabled, invalid })}`}
        >
          {size === "register" && <CalendarToggleButton label={label} disabled={disabled} />}
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
          {size === "backoffice" && <CalendarToggleButton label={label} disabled={disabled} />}
        </AriaGroup>
        {shownError !== undefined ? (
          <AriaText
            slot="errorMessage"
            className={fieldErrorClassName}
            {...disabledTextProps(disabled)}
          >
            {shownError}
          </AriaText>
        ) : (
          !invalid &&
          description !== undefined && (
            <AriaText
              slot="description"
              className={fieldHelperClassName}
              {...disabledTextProps(disabled)}
            >
              {description}
            </AriaText>
          )
        )}
        <AriaPopover style={menuPopoverStyle} className={popoverClassName}>
          <AriaDialog aria-labelledby={calendarTitleId} className={dialogClassName}>
            <AriaCalendar minValue={minValue} maxValue={maxValue}>
              <CalendarHeader titleId={calendarTitleId} name={name} />
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
