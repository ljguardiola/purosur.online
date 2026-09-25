export const PT_PER_MM = 72 / 25.4;

export const PADDING_TOP_BOTTOM_MM = 4.5;
export const CONTENT_GAP_MM = 1.5;
export const NAME_FONT_SIZE_PT = 12;
export const NAME_MAX_LINES = 2;

export interface LabelContentLayoutInput {
  labelHeightMm: number;
  paddingTopBottomMm: number;
  /**
   * The name's own rendered height, already clamped to at most `NAME_MAX_LINES`. This must be
   * measured with the exact font/line metrics the name is drawn with (e.g. pdfkit's own
   * `heightOfString`/`currentLineHeight`): reserving less than the renderer's real per-line height
   * makes it clip a wrapped line early instead of showing it.
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

/**
 * Vertically centers a label's whole content group (name block + gap + barcode) within its padded
 * box, the way the proof's CSS (`justify-content: center` on the label, `gap: 1.5mm`) centered it:
 * a 1-line name's shorter group sits lower (a bigger gap above it) than a 2-line name's taller one,
 * instead of a fixed-height name box always pinned to the top.
 */
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
