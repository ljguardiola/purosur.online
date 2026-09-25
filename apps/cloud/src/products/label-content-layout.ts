export const PT_PER_MM = 72 / 25.4;

export const PADDING_TOP_BOTTOM_MM = 4.5;
export const CONTENT_GAP_MM = 1.5;
export const NAME_FONT_SIZE_PT = 12;
// Matches the proof's own CSS (`line-height: 1.1`) rather than a font's built-in line metrics, so
// a name's measured line count centers the same way the browser-rendered proof did.
export const NAME_LINE_HEIGHT_MM = (NAME_FONT_SIZE_PT * 1.1) / PT_PER_MM;
export const NAME_MAX_LINES = 2;

export interface LabelContentLayoutInput {
  labelHeightMm: number;
  paddingTopBottomMm: number;
  /** How many lines the name actually wraps to (measured against the label's content width). */
  nameLineCount: number;
  nameLineHeightMm: number;
  gapMm: number;
  barcodeHeightMm: number;
}

export interface LabelContentLayout {
  nameTopMm: number;
  nameHeightMm: number;
  barcodeTopMm: number;
}

/**
 * Vertically centers a label's whole content group (name block + gap + barcode) within its padded
 * box, the way the proof's CSS (`justify-content: center` on the label, `gap: 1.5mm`) centered it:
 * a 1-line name's shorter group sits lower (a bigger gap above it) than a 2-line name's taller one,
 * instead of a fixed-height name box always pinned to the top.
 */
export function layoutLabelContent(input: LabelContentLayoutInput): LabelContentLayout {
  const nameHeightMm = input.nameLineCount * input.nameLineHeightMm;
  const groupHeightMm = nameHeightMm + input.gapMm + input.barcodeHeightMm;
  const availableHeightMm = input.labelHeightMm - 2 * input.paddingTopBottomMm;
  const nameTopMm = input.paddingTopBottomMm + (availableHeightMm - groupHeightMm) / 2;

  return {
    nameTopMm,
    nameHeightMm,
    barcodeTopMm: nameTopMm + nameHeightMm + input.gapMm,
  };
}
