import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useContext } from "react";
import {
  Button as AriaButton,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Popover as AriaPopover,
  Select as AriaSelect,
  SelectValue as AriaSelectValue,
  CalendarStateContext,
  RangeCalendarStateContext,
} from "react-aria-components";
import { formatMonthAndYear, formatMonthName } from "../../messages/formatters";
import { iconSlotClassName } from "../shared/icon";
import { IconOnlyButton } from "../shared/icon-only-button";
import { menuOptionClassName, menuPopoverStyle, menuSurfaceClassName } from "./field-styles";

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
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const UNBOUNDED_YEAR_REACH = 100;

type PickerOption = { id: number; label: string; disabled: boolean };

function CalendarPicker(props: {
  name: string;
  label: string;
  selected: number;
  options: PickerOption[];
  onChange: (id: number) => void;
}) {
  const { name, label, selected, options, onChange } = props;
  return (
    <AriaSelect
      name={name}
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

export function CalendarHeader({ titleId, name }: { titleId: string; name: string }) {
  const singleState = useContext(CalendarStateContext);
  const rangeState = useContext(RangeCalendarStateContext);
  const state = singleState ?? rangeState;
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
      <IconOnlyButton
        name="Mes anterior"
        slot="previous"
        disabled={state.isPreviousVisibleRangeInvalid()}
        className={calendarNavButtonClassName}
      >
        <span aria-hidden="true" className={iconSlotClassName.md}>
          <ChevronLeft />
        </span>
      </IconOnlyButton>
      <span id={titleId} className={calendarTitleClassName}>
        {formatMonthAndYear(focusedDate.year, focusedDate.month)}
      </span>
      <div className={calendarPickersClassName}>
        <CalendarPicker
          name={`${name}-calendar-month`}
          label="Mes"
          selected={focusedDate.month}
          options={monthOptions}
          onChange={(month) => state.setFocusedDate(focusedDate.set({ month }))}
        />
        <CalendarPicker
          name={`${name}-calendar-year`}
          label="Año"
          selected={focusedDate.year}
          options={yearOptions}
          onChange={(year) => state.setFocusedDate(focusedDate.set({ year }))}
        />
      </div>
      <IconOnlyButton
        name="Mes siguiente"
        slot="next"
        disabled={state.isNextVisibleRangeInvalid()}
        className={calendarNavButtonClassName}
      >
        <span aria-hidden="true" className={iconSlotClassName.md}>
          <ChevronRight />
        </span>
      </IconOnlyButton>
    </div>
  );
}
