const plainSpellingOfUndecomposableLetters: Readonly<Record<string, string>> = {
  ø: "o",
  æ: "ae",
  œ: "oe",
  ß: "ss",
  ł: "l",
  đ: "d",
  þ: "th",
  ħ: "h",
};

export function foldedText(text: string): string {
  return text
    .normalize("NFD")
    .toLowerCase()
    .replace(/[øæœßłđþħ]/gu, (letter) => plainSpellingOfUndecomposableLetters[letter] ?? letter)
    .replace(/\p{M}/gu, "");
}

export function textContainsEveryWord(text: string, query: string): boolean {
  const foldedTextToSearch = foldedText(text);
  return foldedText(query)
    .split(/\s+/)
    .every((word) => foldedTextToSearch.includes(word));
}
