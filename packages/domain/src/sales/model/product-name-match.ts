export interface NameMatch {
  start: number;
  length: number;
}

interface FoldedLetter {
  end: number;
  folded: string;
}

interface NameWord {
  start: number;
  letters: FoldedLetter[];
}

const WORD = /[\p{L}\p{N}\p{M}]+/gu;

export function matchProductName(name: string, query: string): NameMatch[] | undefined {
  const queryWords = wordsOf(query)
    .map((word) => foldedText(word.text))
    .filter((folded) => folded !== "");
  if (queryWords.length === 0) {
    return undefined;
  }

  const nameWords = wordsOf(name).map(nameWord);
  const matchedEnds = new Map<NameWord, number>();
  for (const queryWord of queryWords) {
    const target = nameWords.find((word) => foldedWord(word).startsWith(queryWord));
    if (!target) {
      return undefined;
    }
    const end = endOfPrefix(target, queryWord.length);
    matchedEnds.set(target, Math.max(end, matchedEnds.get(target) ?? 0));
  }

  return nameWords.flatMap((word) => {
    const end = matchedEnds.get(word);
    return end === undefined ? [] : [{ start: word.start, length: end - word.start }];
  });
}

function wordsOf(text: string): { start: number; text: string }[] {
  return [...text.matchAll(WORD)].map((found) => ({ start: found.index, text: found[0] }));
}

function nameWord(word: { start: number; text: string }): NameWord {
  let end = word.start;
  const letters: FoldedLetter[] = [];
  for (const character of word.text) {
    end += character.length;
    letters.push({ end, folded: foldedText(character) });
  }
  return { start: word.start, letters };
}

function foldedText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function foldedWord(word: NameWord): string {
  return word.letters.map((letter) => letter.folded).join("");
}

function endOfPrefix(word: NameWord, foldedLength: number): number {
  let covered = 0;
  let end = word.start;
  for (const letter of word.letters) {
    if (covered >= foldedLength && letter.folded !== "") {
      break;
    }
    covered += letter.folded.length;
    end = letter.end;
  }
  return end;
}
