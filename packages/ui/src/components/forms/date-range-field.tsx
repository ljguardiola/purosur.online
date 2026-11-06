import type { CalendarDate } from "@internationalized/date";
import { useId } from "react";
import {
  CalendarCell as AriaCalendarCell,
  CalendarGrid as AriaCalendarGrid,
  CalendarGridBody as AriaCalendarGridBody,
  CalendarGridHeader as AriaCalendarGridHeader,
  CalendarHeaderCell as AriaCalendarHeaderCell,
  DateInput as AriaDateInput,
  DateRangePicker as AriaDateRangePicker,
  DateSegment as AriaDateSegment,
  Dialog as AriaDialog,
  Group as AriaGroup,
  Label as AriaLabel,
  Popover as AriaPopover,
  RangeCalendar as AriaRangeCalendar,
  Text as AriaText,
  I18nProvider,
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
  inputBaseClassName,
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

const REVERSED_RANGE_MESSAGE = "La fecha de fin no puede ser anterior a la de inicio.";

const separatorClassName = "shrink-0 select-none px-1 text-text-subtle";

const rangeCellClassName =
  `${calendarCellClassName} ` +
  "data-selected:not-data-selection-start:not-data-selection-end:bg-action-subtle " +
  "data-selected:not-data-selection-start:not-data-selection-end:text-text " +
  "data-selected:not-data-selection-start:not-data-selection-end:font-normal";

export function DateRangeField(props: DateRangeFieldProps) {
  const { name, label, value, onChange, description, disabled = false, required = false } = props;
  const size = useFieldSize();
  const { errorMessage, errorMessageId } = fieldError(props);
  const calendarTitleId = useId();
  const minValue = props.minValue ?? null;
  const maxValue = props.maxValue ?? null;
  const rangeMessage = props.rangeMessage;

  const reversed = value !== null && value.end.compare(value.start) < 0;
  const outOfRange =
    value !== null &&
    [value.start, value.end].some(
      (day) =>
        (minValue !== null && day.compare(minValue) < 0) ||
        (maxValue !== null && day.compare(maxValue) > 0),
    );
  const shownError =
    errorMessage ?? (reversed ? REVERSED_RANGE_MESSAGE : outOfRange ? rangeMessage : undefined);
  const invalid = shownError !== undefined || errorMessageId !== undefined;
  const labelClassName = fieldLabelClassName[size];
  const frameClassName =
    size === "backoffice" ? backofficeFieldBoxClassName : registerFrameClassName;
  const valueClassName =
    size === "backoffice" ? backofficeFieldValueClassName : registerValueClassName;
  const segmentsClassName = (day: CalendarDate | undefined) =>
    day === undefined ? `${segmentClassName} ${emptySeparatorClassName}` : segmentClassName;

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
          <AriaDateInput slot="start" className={`${inputBaseClassName} ${valueClassName}`}>
            {(segment) => (
              <AriaDateSegment segment={segment} className={segmentsClassName(value?.start)} />
            )}
          </AriaDateInput>
          <span aria-hidden="true" className={`${separatorClassName} ${valueClassName}`}>
            –
          </span>
          <AriaDateInput slot="end" className={`${inputBaseClassName} ${valueClassName}`}>
            {(segment) => (
              <AriaDateSegment segment={segment} className={segmentsClassName(value?.end)} />
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
