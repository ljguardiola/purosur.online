import type { CalendarDate } from "@internationalized/date";
import { useContext, useId } from "react";
import {
  CalendarCell as AriaCalendarCell,
  CalendarGrid as AriaCalendarGrid,
  CalendarGridBody as AriaCalendarGridBody,
  CalendarGridHeader as AriaCalendarGridHeader,
  CalendarHeaderCell as AriaCalendarHeaderCell,
  DateFieldContext as AriaDateFieldContext,
  DateInput as AriaDateInput,
  DateRangePicker as AriaDateRangePicker,
  DateRangePickerStateContext as AriaDateRangePickerStateContext,
  DateSegment as AriaDateSegment,
  Dialog as AriaDialog,
  Group as AriaGroup,
  Label as AriaLabel,
  Popover as AriaPopover,
  RangeCalendar as AriaRangeCalendar,
  Text as AriaText,
  I18nProvider,
  useSlottedContext,
} from "react-aria-components";
import type { Locale } from "../../messages/formatters";
import { CalendarHeader } from "./calendar-header";
import {
  CalendarToggleButton,
  calendarCellClassName,
  calendarGridClassName,
  calendarWeekdayClassName,
  dialogClassName,
  emptySeparatorClassName,
  popoverClassName,
  registerFrameClassName,
  registerValueClassName,
  segmentClassName,
} from "./date-field-parts";
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
} from "./field-styles";

export type DateRange = { start: CalendarDate; end: CalendarDate };

type DateRangeFieldCommonProps = {
  name: string;
  label: string;
  value: DateRange | null;
  onChange: (value: DateRange | null) => void;
  onEmptied?: () => void;
  description?: string;
  disabled?: boolean;
  required?: boolean;
};

type DateRangeFieldBoundsProps =
  | { minValue?: undefined; maxValue?: undefined; rangeMessage?: undefined }
  | { minValue: CalendarDate; maxValue?: CalendarDate; rangeMessage: string }
  | { minValue?: CalendarDate; maxValue: CalendarDate; rangeMessage: string };

export type DateRangeFieldProps = DateRangeFieldCommonProps &
  FieldErrorProps &
  DateRangeFieldBoundsProps;

const LOCALE: Locale = "es-AR";

const inputClassName = "flex min-w-0 outline-none";

const separatorClassName = "shrink-0 select-none px-1 text-text-subtle";

const rangeCellClassName =
  `${calendarCellClassName} ` +
  "data-selected:not-data-selection-start:not-data-selection-end:bg-action-subtle " +
  "data-selected:not-data-selection-start:not-data-selection-end:text-text " +
  "data-selected:not-data-selection-start:not-data-selection-end:font-normal";

type RangeEnd = "start" | "end";

function RangeEndInput({
  end,
  className,
  onEmptied,
}: {
  end: RangeEnd;
  className: string;
  onEmptied: (() => void) | undefined;
}) {
  const fieldProps = useSlottedContext(AriaDateFieldContext, end);
  const state = useContext(AriaDateRangePickerStateContext);
  const day = state?.value[end] ?? null;
  const otherDay = state?.value[end === "start" ? "end" : "start"] ?? null;
  return (
    <AriaDateFieldContext.Provider
      value={{
        ...fieldProps,
        onChange: (changed) => {
          fieldProps?.onChange?.(changed);
          if (changed === null && otherDay === null) {
            onEmptied?.();
          }
        },
      }}
    >
      <AriaDateInput className={className}>
        {(segment) => (
          <AriaDateSegment
            segment={segment}
            className={
              day === null ? `${segmentClassName} ${emptySeparatorClassName}` : segmentClassName
            }
          />
        )}
      </AriaDateInput>
    </AriaDateFieldContext.Provider>
  );
}

export function DateRangeField(props: DateRangeFieldProps) {
  const {
    name,
    label,
    value,
    onChange,
    onEmptied,
    description,
    disabled = false,
    required = false,
  } = props;
  const size = useFieldSize();
  const { errorMessage, errorMessageId } = fieldError(props);
  const calendarTitleId = useId();
  const minValue = props.minValue ?? null;
  const maxValue = props.maxValue ?? null;
  const rangeMessage = props.rangeMessage;

  const outOfRange =
    value !== null &&
    [value.start, value.end].some(
      (day) =>
        (minValue !== null && day.compare(minValue) < 0) ||
        (maxValue !== null && day.compare(maxValue) > 0),
    );
  const shownError = errorMessage ?? (outOfRange ? rangeMessage : undefined);
  const invalid = shownError !== undefined || errorMessageId !== undefined;
  const labelClassName = fieldLabelClassName[size];
  const frameClassName =
    size === "backoffice" ? backofficeFieldBoxClassName : registerFrameClassName;
  const valueClassName =
    size === "backoffice" ? backofficeFieldValueClassName : registerValueClassName;

  return (
    <I18nProvider locale={LOCALE}>
      <AriaDateRangePicker
        startName={`${name}-start`}
        endName={`${name}-end`}
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
          <RangeEndInput
            end="start"
            className={`${inputClassName} ${valueClassName}`}
            onEmptied={onEmptied}
          />
          <span aria-hidden="true" className={`${separatorClassName} ${valueClassName}`}>
            –
          </span>
          <RangeEndInput
            end="end"
            className={`${inputClassName} ${valueClassName}`}
            onEmptied={onEmptied}
          />
          <span aria-hidden="true" className="flex-1" />
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
            <AriaRangeCalendar minValue={minValue} maxValue={maxValue}>
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
                  {(date) => <AriaCalendarCell date={date} className={rangeCellClassName} />}
                </AriaCalendarGridBody>
              </AriaCalendarGrid>
            </AriaRangeCalendar>
          </AriaDialog>
        </AriaPopover>
      </AriaDateRangePicker>
    </I18nProvider>
  );
}
