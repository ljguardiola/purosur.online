export function linesOfText(container: Element, text: string): number {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.textContent === text) {
      const range = document.createRange();
      range.selectNodeContents(node);
      return new Set(Array.from(range.getClientRects(), (line) => Math.round(line.top))).size;
    }
  }
  throw new Error(`no text node reads "${text}"`);
}
