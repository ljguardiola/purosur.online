import { Calendar as CalendarIcon } from "lucide-react";
import { iconSlotClassName } from "../shared/icon";
import { IconOnlyButton } from "../shared/icon-only-button";
import { menuSurfaceClassName } from "./field-styles";

export const registerFrameClassName = "h-control-4xl gap-2 px-4";
export const registerValueClassName = "text-heading text-text";

export const inputBaseClassName = "flex min-w-0 flex-1 outline-none";

export const placeholderHiddenInputClassName =
  "max-w-0 flex-none overflow-hidden opacity-0 " +
  "group-data-focus-within:max-w-none group-data-focus-within:flex-1 group-data-focus-within:opacity-100";
export const placeholderClassName =
  "min-w-0 flex-1 cursor-text truncate text-text-subtle group-data-focus-within:hidden";

// The focused segment gets its own fill because the box's focus shadow doesn't move with the
// active segment and this field draws no caret, so nothing else marks which segment is next.
// `not-data-focused` keeps the placeholder tone from losing to the focused segment's color
// regardless of the two Tailwind rules' generated order.
export const segmentClassName =
  "rounded-sm outline-none " +
  "data-placeholder:not-data-focused:text-text-subtle " +
  "data-focused:bg-action data-focused:text-text-inverse";

// react-aria never marks a literal `/` segment as a placeholder (`data-placeholder` follows
// `segment.isPlaceholder`, which a literal never is), so without this rule it would keep its
// full-strength tone between dimmed digits even while the field holds no date.
export const emptySeparatorClassName = "literal:text-text-subtle";

// WCAG 2.5.8 requires a 24x24 CSS px pointer target; the 18px glyph the design draws is under
// that minimum on a touch-screen register. The negative margin pulls the extra 3px per side back
// out of the flex layout so the glyph's own edge still lands on the box's padding.
const iconButtonClassName =
  "inline-flex size-6 shrink-0 -mx-0.75 items-center justify-center text-text-subtle outline-none " +
  "data-focus-visible:focus-ring";

export const popoverClassName = `outline-none ${menuSurfaceClassName}`;
export const dialogClassName = "flex flex-col gap-3 p-4 outline-none";
// A focused day's outline ring reaches 5px past its cell (3px width + 2px offset), one pixel into
// the neighbouring cell across the 4px gap; border-collapse would let it paint over that cell's
// fill entirely and drop its contrast under 2:1.
export const calendarGridClassName = "border-separate border-spacing-1";
export const calendarWeekdayClassName = "h-8 text-detail font-bold text-text-subtle";
export const calendarCellClassName =
  "flex size-control-lg items-center justify-center rounded-md text-body text-text outline-none " +
  "data-hovered:bg-surface-subtle " +
  "data-today:font-bold data-today:inset-ring-2 data-today:inset-ring-action " +
  "data-selected:bg-action data-selected:text-text-inverse data-selected:font-bold " +
  "data-disabled:pointer-events-none data-disabled:opacity-disabled " +
  "data-outside-month:invisible " +
  "data-focus-visible:focus-ring-tight";

export function CalendarToggleButton({ label, disabled }: { label: string; disabled: boolean }) {
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
