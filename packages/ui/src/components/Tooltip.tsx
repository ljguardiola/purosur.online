import type { CSSProperties, ReactElement, ReactNode } from "react";
import {
  OverlayArrow as AriaOverlayArrow,
  Tooltip as AriaTooltip,
  TooltipTrigger as AriaTooltipTrigger,
  type OverlayArrowRenderProps,
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
// in the class below, once as the number the arrow's center shift and boundary offset below are
// derived from.
const ARROW_SIZE_PX = 10;

// The design's own gap from the element to the box's edge (design.pen's "Backoffice / Roles ·
// Nuevo rol · Modal" tooltip, the one instance that draws the arrow glued to the box rather than
// floating off it).
const BOX_OFFSET_PX = 10;

// OverlayArrow paints nothing itself; it only places this square at whichever edge react-aria's
// flip logic settles on. `block` is required, not decorative: a bare <span> defaults to
// display:inline, which ignores an explicit width/height entirely, collapsing both this element
// and (since OverlayArrow's own wrapper shrink-to-fits around it) its parent to 0x0.
const arrowSquareClassName = "block size-[10px] rotate-45 bg-ink";

// OverlayArrow's own wrapper hugs the box's edge with none of the square crossing it, which puts
// the square's center half its own size outside the box. Pulling the square in by that same half,
// via a negative margin on whichever side faces the box, lands its center exactly on the box's
// edge instead: half of it merges into the box, the rest rotates out into a diamond whose tip
// points at the element, matching the design's own glued-on arrow instead of a square merely
// touching the box at one corner.
const ARROW_CENTER_SHIFT_PX = ARROW_SIZE_PX / 2;

function arrowStyle({
  placement,
  defaultStyle,
}: OverlayArrowRenderProps & { defaultStyle: CSSProperties }): CSSProperties {
  if (placement === "bottom") {
    return { ...defaultStyle, marginBottom: -ARROW_CENTER_SHIFT_PX };
  }
  if (placement === "top") {
    return { ...defaultStyle, marginTop: -ARROW_CENTER_SHIFT_PX };
  }
  // The box only ever requests "bottom", flipped to "top" when there's no room below: no other
  // placement value reaches this component.
  return defaultStyle;
}

// react-aria keeps the arrow clear of the box's edges by this many pixels less than half the
// (unrotated) arrow size it measures, so it only ever guarantees room for a 10px square, not the
// wider 14.14px diamond that square's own 45deg rotation actually paints. Near a boundary (a
// trigger close to the viewport edge, forcing the box sideways) that shortfall lands the diamond
// on the box's own 6px corner radius, where the curve has already pulled the fill back from the
// diamond's overlap point: the diamond then reads as floating free of the box instead of glued to
// it. Padding the boundary by the corner radius plus that shortfall keeps it on the flat edge.
const BOX_CORNER_RADIUS_PX = 6;
const ARROW_BOUNDARY_OFFSET_PX =
  BOX_CORNER_RADIUS_PX + (ARROW_SIZE_PX * Math.SQRT2 - ARROW_SIZE_PX) / 2;

// Overrides react-aria's own 1500ms default.
const HOVER_DELAY_MS = 300;

// Overrides react-stately's own 500ms default, which otherwise keeps the tooltip on screen for
// half a second after the pointer has already left the element it explains. It cannot be 0: WCAG
// 2.1 SC 1.4.13 requires the pointer to be able to move from the element onto the tooltip itself
// without the tooltip closing first. The arrow bridges the gap only under the element's center;
// anywhere off to either side, the pointer crosses up to BOX_OFFSET_PX of bare page between the
// element and the box. react-stately cancels the pending close the moment the tooltip reports its
// own hover start, so this only has to outlast that crossing: 100ms covers those 10px even at a
// slow 100px per second.
const CLOSE_DELAY_MS = 100;

export function Tooltip({ description, children }: TooltipProps) {
  return (
    <AriaTooltipTrigger delay={HOVER_DELAY_MS} closeDelay={CLOSE_DELAY_MS}>
      {children}
      <AriaTooltip
        placement="bottom"
        offset={BOX_OFFSET_PX}
        arrowBoundaryOffset={ARROW_BOUNDARY_OFFSET_PX}
        className={tooltipClassName}
      >
        {/* Painted before the description in source order, but react-aria positions it with
            `position: absolute`, which paints above the description's plain, unpositioned text
            regardless of source order; with its center on the box's edge, the diamond's inner tip
            reaches only half its diagonal (about 7.07px) into the box, short of the box's own 12px
            padding, so it never reaches that text anyway. The box's own drop shadow is part of the box's background, painted
            behind both, so it can only ever show past the diamond's edges, not over it. */}
        <AriaOverlayArrow style={arrowStyle}>
          <span aria-hidden="true" className={arrowSquareClassName} />
        </AriaOverlayArrow>
        {description}
      </AriaTooltip>
    </AriaTooltipTrigger>
  );
}
