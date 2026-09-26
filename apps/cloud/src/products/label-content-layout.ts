export const PT_PER_MM = 72 / 25.4;

export const PADDING_TOP_BOTTOM_MM = 4.5;
export const CONTENT_GAP_MM = 1.5;
export const NAME_FONT_SIZE_PT = 12;
export const NAME_LINE_HEIGHT_PT = 1.1 * NAME_FONT_SIZE_PT;
export const NAME_MAX_LINES = 2;

export interface LabelContentLayoutInput {
  labelHeightMm: number;
  paddingTopBottomMm: number;
  /**
   * The name's own rendered height, clamped to `NAME_MAX_LINES`. Must be measured with the exact
   * font and line spacing it's drawn with, or a wrapped line clips early instead of showing.
   */
  nameHeightMm: number;
  gapMm: number;
  barcodeHeightMm: number;
}

export interface LabelContentLayout {
  nameTopMm: number;
  nameHeightMm: number;
  barcodeTopMm: number;
}

// Centers the whole content group (name + gap + barcode) as a unit, rather than pinning the name
// to a fixed-height box at the top.
export function layoutLabelContent(input: LabelContentLayoutInput): LabelContentLayout {
  const groupHeightMm = input.nameHeightMm + input.gapMm + input.barcodeHeightMm;
  const availableHeightMm = input.labelHeightMm - 2 * input.paddingTopBottomMm;
  const nameTopMm = input.paddingTopBottomMm + (availableHeightMm - groupHeightMm) / 2;

  return {
    nameTopMm,
    nameHeightMm: input.nameHeightMm,
    barcodeTopMm: nameTopMm + input.nameHeightMm + input.gapMm,
  };
}
