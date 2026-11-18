export function linesPainted(element: HTMLElement): number {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const tops = new Set<number>();
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      tops.add(Math.round(rect.top));
    }
  }
  return tops.size;
}

export function linesPaintedUnder(table: HTMLElement, headerName: string): number[] {
  const headers = [...table.querySelectorAll("thead th")];
  const column = headers.findIndex((header) => header.textContent?.trim() === headerName);
  if (column < 0) {
    throw new Error(`test setup: the table has no ${headerName} column`);
  }
  return [...table.querySelectorAll("tbody tr")]
    .map((row) => row.querySelectorAll("td")[column])
    .filter((cell): cell is HTMLTableCellElement => cell !== undefined)
    .map(linesPainted);
}
