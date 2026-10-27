const WORD = /[\p{L}\p{N}\p{M}]+/gu;

export function wordsOf(text: string): { start: number; text: string }[] {
  return [...text.matchAll(WORD)].map((found) => ({ start: found.index, text: found[0] }));
}
