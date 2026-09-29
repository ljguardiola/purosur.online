import type { CSSProperties, ReactElement, ReactNode } from "react";
import {
  OverlayArrow as AriaOverlayArrow,
  Tooltip as AriaTooltip,
  TooltipTrigger as AriaTooltipTrigger,
  type OverlayArrowRenderProps,
} from "react-aria-components";

// `ReactElement` rejects plain text and an array of elements, but it cannot reject a fragment or
// a non-focusable element such as a bare <span>: every JSX expression is typed
// `ReactElement<any, any>`, which is assignable to any narrower ReactElement, so those two still
// compile here and would render a tooltip that never opens.
export type TooltipProps = {
  description: Exclude<ReactNode, null | undefined | boolean>;
  children: ReactElement;
};

const tooltipClassName =
  "max-w-75 rounded-md bg-surface-inverse p-3 text-detail text-text-inverse leading-sm " +
  "shadow-sm";

// Tailwind only compiles class names it can read as literals, so this size is spelled twice: once
// in the class below, once as the number the arrow's center shift and boundary offset below are
// derived from.
const ARROW_SIZE_PX = 10;

const BOX_OFFSET_PX = 10;

// `block` is required, not decorative: a bare <span> defaults to display:inline, which ignores an
// explicit width/height entirely, collapsing both this element and (since OverlayArrow's own
// wrapper shrink-to-fits around it) its parent to 0x0.
const arrowSquareClassName = "block size-2.5 rotate-45 bg-surface-inverse";

// OverlayArrow's wrapper hugs the box's edge with none of the square crossing it, putting the
// square's center half its own size outside the box. A negative margin of that same half, on
// whichever side faces the box, pulls its center onto the box's edge instead: half merges into the
// box, the rest rotates out into a diamond whose tip points at the element.
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

// react-aria only guarantees boundary room for the unrotated 10px square, not the wider 14.14px
// diamond its 45deg rotation actually paints. Near a viewport edge, that shortfall can land the
// diamond on the box's own corner radius, where the curve has already pulled the fill back, making
// the diamond read as floating free of the box. Padding the boundary by the corner radius plus
// that shortfall keeps it on the flat edge instead.
const BOX_CORNER_RADIUS_PX = 6;
const ARROW_BOUNDARY_OFFSET_PX =
  BOX_CORNER_RADIUS_PX + (ARROW_SIZE_PX * Math.SQRT2 - ARROW_SIZE_PX) / 2;

// Overrides react-aria's own 1500ms default.
const HOVER_DELAY_MS = 300;

// Cannot be 0: WCAG 2.1 SC 1.4.13 requires the pointer to be able to move from the element onto
// the tooltip without it closing first. The arrow bridges the gap only under the element's center;
// off to either side, the pointer crosses up to BOX_OFFSET_PX of bare page. This only has to
// outlast that crossing, and 100ms covers those 10px even at a slow 100px per second.
export const CLOSE_DELAY_MS = 100;

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
        {/* position: absolute paints this above the description's unpositioned text regardless of
            source order; its diamond's inner tip reaches only ~7.07px into the box, short of the
            box's own 12px padding, so it never reaches that text anyway. */}
        <AriaOverlayArrow style={arrowStyle}>
          <span aria-hidden="true" className={arrowSquareClassName} />
        </AriaOverlayArrow>
        {description}
      </AriaTooltip>
    </AriaTooltipTrigger>
  );
}
