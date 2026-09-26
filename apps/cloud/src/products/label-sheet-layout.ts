export const LABEL_COLUMNS = 3;
export const LABEL_ROWS = 8;
export const LABELS_PER_PAGE = LABEL_COLUMNS * LABEL_ROWS;
export const LABEL_WIDTH_MM = 70;
const A4_HEIGHT_MM = 297;
export const LABEL_HEIGHT_MM = A4_HEIGHT_MM / LABEL_ROWS;

export interface LabelSheetItem {
  name: string;
  code: string;
  count: number;
}

export interface PositionedLabel {
  name: string;
  code: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  cutRight: boolean;
  cutBottom: boolean;
}

export interface LabelSheetPage {
  labels: PositionedLabel[];
}

function flatten(items: LabelSheetItem[]): Array<{ name: string; code: string }> {
  const flattened: Array<{ name: string; code: string }> = [];
  for (const item of items) {
    for (let repetition = 0; repetition < item.count; repetition += 1) {
      flattened.push({ name: item.name, code: item.code });
    }
  }
  return flattened;
}

export function layoutLabelSheet(items: LabelSheetItem[]): LabelSheetPage[] {
  const flattened = flatten(items);
  const pages: LabelSheetPage[] = [];

  for (let pageStart = 0; pageStart < flattened.length; pageStart += LABELS_PER_PAGE) {
    const pageItems = flattened.slice(pageStart, pageStart + LABELS_PER_PAGE);
    const labels = pageItems.map((item, index) => {
      const column = index % LABEL_COLUMNS;
      const row = Math.floor(index / LABEL_COLUMNS);
      return {
        name: item.name,
        code: item.code,
        xMm: column * LABEL_WIDTH_MM,
        yMm: row * LABEL_HEIGHT_MM,
        widthMm: LABEL_WIDTH_MM,
        heightMm: LABEL_HEIGHT_MM,
        cutRight: column < LABEL_COLUMNS - 1 && index + 1 < pageItems.length,
        cutBottom: row < LABEL_ROWS - 1 && index + LABEL_COLUMNS < pageItems.length,
      };
    });
    pages.push({ labels });
  }

  return pages;
}
