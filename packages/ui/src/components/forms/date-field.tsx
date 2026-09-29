import type { CalendarDate } from "@internationalized/date";
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useContext, useId } from "react";
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
  Label as AriaLabel,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Popover as AriaPopover,
  Select as AriaSelect,
  SelectValue as AriaSelectValue,
  Text as AriaText,
  CalendarStateContext,
  I18nProvider,
} from "react-aria-components";
import { formatMonthAndYear, formatMonthName, type Locale } from "../../messages/formatters";
import { iconSlotClassName } from "../shared/icon";
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
  menuOptionClassName,
  menuPopoverStyle,
  menuSurfaceClassName,
} from "./field-styles";

// CalendarDate's constructor constrains an invalid day, such as February 30th, to the month's
// real last day instead of refusing it, so no caller value can reach here unparseable.
type DateFieldCommonProps = {
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
const calendarHeaderClassName = "flex items-center justify-between";
const calendarPickersClassName = "flex items-center gap-1";
const calendarTitleClassName = "sr-only";
const calendarNavButtonClassName =
  "inline-flex size-control-lg shrink-0 items-center justify-center rounded-md text-text-subtle outline-none " +
  "data-hovered:bg-surface-subtle " +
  "data-disabled:opacity-disabled " +
  "data-focus-visible:focus-ring";
const calendarPickerTriggerClassName =
  "inline-flex h-control-lg items-center gap-1 rounded-md px-2 text-body font-bold text-text outline-none " +
  "data-hovered:bg-surface-subtle " +
  "data-focus-visible:focus-ring";
const calendarPickerPopoverClassName = `min-w-40 p-1.5 overflow-y-auto ${menuSurfaceClassName}`;
const calendarPickerOptionClassName = `${menuOptionClassName} data-disabled:cursor-default data-disabled:opacity-disabled`;
// A focused day's outline ring reaches 5px past its cell (3px width + 2px offset), one pixel into
// the neighbouring cell across the 4px gap; border-collapse would let it paint over that cell's
// fill entirely and drop its contrast under 2:1.
const calendarGridClassName = "border-separate border-spacing-1";
const calendarWeekdayClassName = "h-8 text-detail font-bold text-text-subtle";
const calendarCellClassName =
  "size-control-lg rounded-md text-center align-middle text-body text-text outline-none " +
  "data-hovered:bg-surface-subtle " +
  "data-today:font-bold data-today:inset-ring-2 data-today:inset-ring-action " +
  "data-selected:bg-action data-selected:text-text-inverse data-selected:font-bold " +
  "data-disabled:pointer-events-none data-disabled:opacity-disabled " +
  "data-outside-month:invisible " +
  "data-focus-visible:focus-ring-tight";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const UNBOUNDED_YEAR_REACH = 100;

type PickerOption = { id: number; label: string; disabled: boolean };

function CalendarPicker(props: {
  label: string;
  selected: number;
  options: PickerOption[];
  onChange: (id: number) => void;
}) {
  const { label, selected, options, onChange } = props;
  return (
    <AriaSelect
      aria-label={label}
      selectedKey={selected}
      onSelectionChange={(key) => {
        if (typeof key === "number") {
          onChange(key);
        }
      }}
    >
      <AriaButton className={calendarPickerTriggerClassName}>
        <AriaSelectValue />
        <span aria-hidden="true" className={`${iconSlotClassName.sm} text-text-subtle`}>
          <ChevronDown />
        </span>
      </AriaButton>
      <AriaPopover offset={4} style={menuPopoverStyle} className={calendarPickerPopoverClassName}>
        <AriaListBox className="flex flex-col gap-1">
          {options.map((option) => (
            <AriaListBoxItem
              key={option.id}
              id={option.id}
              textValue={option.label}
              isDisabled={option.disabled}
              className={calendarPickerOptionClassName}
            >
              {option.label}
            </AriaListBoxItem>
          ))}
        </AriaListBox>
      </AriaPopover>
    </AriaSelect>
  );
}

function CalendarHeader({ titleId }: { titleId: string }) {
  const state = useContext(CalendarStateContext);
  if (state === null) {
    return null;
  }
  const { focusedDate, minValue, maxValue } = state;

  const monthOptions = MONTHS.map((month) => {
    const start = focusedDate.set({ month, day: 1 });
    const beforeRange = minValue != null && start.add({ months: 1 }).compare(minValue) <= 0;
    const afterRange = maxValue != null && start.compare(maxValue) > 0;
    return { id: month, label: formatMonthName(month), disabled: beforeRange || afterRange };
  });

  const firstYear = minValue?.year ?? focusedDate.year - UNBOUNDED_YEAR_REACH;
  const lastYear = maxValue?.year ?? focusedDate.year + UNBOUNDED_YEAR_REACH;
  const yearOptions = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => ({
    id: firstYear + index,
    label: String(firstYear + index),
    disabled: false,
  }));

  return (
    <div className={calendarHeaderClassName}>
      <AriaButton slot="previous" className={calendarNavButtonClassName}>
        <span aria-hidden="true" className={iconSlotClassName.md}>
          <ChevronLeft />
        </span>
      </AriaButton>
      <span id={titleId} className={calendarTitleClassName}>
        {formatMonthAndYear(focusedDate.year, focusedDate.month)}
      </span>
      <div className={calendarPickersClassName}>
        <CalendarPicker
          label="Mes"
          selected={focusedDate.month}
          options={monthOptions}
          onChange={(month) => state.setFocusedDate(focusedDate.set({ month }))}
        />
        <CalendarPicker
          label="Año"
          selected={focusedDate.year}
          options={yearOptions}
          onChange={(year) => state.setFocusedDate(focusedDate.set({ year }))}
        />
      </div>
      <AriaButton slot="next" className={calendarNavButtonClassName}>
        <span aria-hidden="true" className={iconSlotClassName.md}>
          <ChevronRight />
        </span>
      </AriaButton>
    </div>
  );
}

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
  const { label, value, onChange, description, disabled = false, required = false } = props;
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
              <CalendarHeader titleId={calendarTitleId} />
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
