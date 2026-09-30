import { weekdaysText } from "./discount-texts";

const WEEKDAY_MARKERS = [
  { weekday: 1, letter: "L" },
  { weekday: 2, letter: "M" },
  { weekday: 3, letter: "M" },
  { weekday: 4, letter: "J" },
  { weekday: 5, letter: "V" },
  { weekday: 6, letter: "S" },
  { weekday: 7, letter: "D" },
] as const;

const markerClassName = "flex size-6 items-center justify-center rounded-full text-detail";
const filledClassName = "bg-action font-bold text-text-inverse";
const emptyClassName = "bg-surface-soft text-text";

export function DiscountWeekdays({ weekdays }: { weekdays: readonly number[] }) {
  const everyDay = weekdays.length === 0;
  return (
    <span role="img" aria-label={weekdaysText(weekdays)} className="flex gap-1">
      {WEEKDAY_MARKERS.map(({ weekday, letter }) => (
        <span
          key={weekday}
          aria-hidden="true"
          data-weekday={weekday}
          className={`${markerClassName} ${
            everyDay || weekdays.includes(weekday) ? filledClassName : emptyClassName
          }`}
        >
          {letter}
        </span>
      ))}
    </span>
  );
}
