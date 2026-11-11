function characterTop(textNodes: Text[], index: number): number {
  let remaining = index;
  for (const node of textNodes) {
    if (remaining < node.length) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.setEnd(node, remaining + 1);
      return range.getBoundingClientRect().top;
    }
    remaining -= node.length;
  }
  throw new Error(`no character at ${index}`);
}

export function staysOnOneLine(element: Element, text: string): boolean {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    textNodes.push(node as Text);
  }
  const start = textNodes
    .map((node) => node.data)
    .join("")
    .indexOf(text);
  if (start === -1) {
    throw new Error(`"${text}" is not in the element`);
  }
  return characterTop(textNodes, start) === characterTop(textNodes, start + text.length - 1);
}
