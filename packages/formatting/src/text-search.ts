export function foldedText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function textContainsEveryWord(text: string, query: string): boolean {
  const foldedTextToSearch = foldedText(text);
  return foldedText(query)
    .split(/\s+/)
    .every((word) => foldedTextToSearch.includes(word));
}
