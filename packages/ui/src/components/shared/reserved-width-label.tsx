// The label going regular -> bold on choosing an option would otherwise widen that option (and so
// the whole control), since bold text measures wider than regular text at the same size. A hidden
// bold copy stacked in the same grid cell (via `col-start-1 row-start-1`) always reserves the
// bolder, wider width, so the grid cell's own width never changes when the visible copy's weight
// does. `invisible` keeps it out of the paint but not out of layout, and `aria-hidden` keeps it
// out of the accessibility tree so it isn't announced alongside the real, visible label.
export function ReservedWidthLabel({ label }: { label: string }) {
  return (
    <span className="relative grid">
      <span
        aria-hidden="true"
        className="invisible col-start-1 row-start-1 whitespace-nowrap text-body font-bold"
      >
        {label}
      </span>
      <span className="col-start-1 row-start-1 whitespace-nowrap text-body text-text group-data-selected:font-bold group-data-selected:text-text-accent">
        {label}
      </span>
    </span>
  );
}
