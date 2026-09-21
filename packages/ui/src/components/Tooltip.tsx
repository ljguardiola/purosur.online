import type { ReactElement, ReactNode } from "react";
import {
  OverlayArrow as AriaOverlayArrow,
  Tooltip as AriaTooltip,
  TooltipTrigger as AriaTooltipTrigger,
} from "react-aria-components";

// `children` is the element the tooltip explains, not the explanation itself (unlike Toggle.tsx's
// `children`): react-aria's TooltipTrigger passes hover, focus and aria-describedby down to one
// focusable node through context. `ReactElement` rejects plain text and an array of elements, but
// it cannot reject a fragment or a non-focusable element such as a bare <span>: every JSX
// expression is typed `ReactElement<any, any>`, which is assignable to any narrower ReactElement,
// so those two compile here and render a tooltip that never opens.
export type TooltipProps = {
  description: Exclude<ReactNode, null | undefined | boolean>;
  children: ReactElement;
};

const tooltipClassName =
  "max-w-75 rounded-md bg-ink p-3 text-sm text-surface-white leading-[1.35] " +
  "shadow-[0_6px_16px_var(--color-ink-shadow)]";

// Tailwind only compiles class names it can read as literals, so this size is spelled twice: once
// in the class below, once as the number the offset is derived from.
const ARROW_SIZE_PX = 10;

// The air left between the element and the nearest thing the user sees of the tooltip, which is
// the arrow's tip rather than the box.
const ELEMENT_GAP_PX = 8;

// OverlayArrow's own wrapper hugs the box's edge, and the square inside it rotates around its own
// center, so the diamond sticks out past that edge by half a side plus half a diagonal. react-aria
// measures `offset` to the box, so the offset has to carry that overhang as well as the gap;
// without it the diamond is painted over the element it points at.
const ARROW_OVERHANG_PX = ARROW_SIZE_PX / 2 + (ARROW_SIZE_PX * Math.SQRT2) / 2;
const BOX_OFFSET_PX = ELEMENT_GAP_PX + ARROW_OVERHANG_PX;

// OverlayArrow paints nothing itself; it only places this square at whichever edge react-aria's
// flip logic settles on. `block` is required, not decorative: a bare <span> defaults to
// display:inline, which ignores an explicit width/height entirely, collapsing both this element
// and (since OverlayArrow's own wrapper shrink-to-fits around it) its parent to 0x0.
const arrowSquareClassName = "block size-[10px] rotate-45 bg-ink";

// Overrides react-aria's own 1500ms default.
const HOVER_DELAY_MS = 300;

export function Tooltip({ description, children }: TooltipProps) {
  return (
    <AriaTooltipTrigger delay={HOVER_DELAY_MS}>
      {children}
      <AriaTooltip placement="bottom" offset={BOX_OFFSET_PX} className={tooltipClassName}>
        <AriaOverlayArrow>
          <span aria-hidden="true" className={arrowSquareClassName} />
        </AriaOverlayArrow>
        {description}
      </AriaTooltip>
    </AriaTooltipTrigger>
  );
}
