function foldedText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function textContains(text: string, query: string): boolean {
  return foldedText(text).includes(foldedText(query));
}
