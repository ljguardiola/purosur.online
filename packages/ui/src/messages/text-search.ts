function foldedText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function foldedWords(query: string): string[] {
  return foldedText(query)
    .split(/\s+/u)
    .filter((word) => word !== "");
}

export function textsContainEveryWord(texts: readonly string[], query: string): boolean {
  const folded = texts.map(foldedText);
  return foldedWords(query).every((word) => folded.some((text) => text.includes(word)));
}

export function textContains(text: string, query: string): boolean {
  return textsContainEveryWord([text], query);
}
