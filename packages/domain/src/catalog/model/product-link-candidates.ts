import { compareSpanishText, foldedText } from "../../shared/index.js";
import { isNetContentMentioned, netContentMentions } from "./net-content-mention.js";
import type { NetContentUnit } from "./product.js";
import { wordsOf } from "./text-words.js";

export const PRODUCT_LINK_CANDIDATE_LIMIT = 20;

const MIN_ABBREVIATION_LENGTH = 3;

function foldedWords(text: string): string[] {
  return wordsOf(text)
    .map((word) => foldedText(word.text))
    .filter((word) => word !== "");
}

// A text word counts for a product word when it is that word or, from a few letters on, its start.
function appearsIn(productWord: string, textWords: readonly string[]): boolean {
  return textWords.some(
    (textWord) =>
      textWord === productWord ||
      (textWord.length >= MIN_ABBREVIATION_LENGTH && productWord.startsWith(textWord)),
  );
}

function matchingWords(name: string, textWords: readonly string[]): number {
  return new Set(foldedWords(name).filter((word) => appearsIn(word, textWords))).size;
}

export function productLinkCandidates<
  T extends {
    id: string;
    name: string;
    brandName: string | null;
    netContent: { quantity: number; unit: NetContentUnit } | null;
  },
>(products: readonly T[], text: string, limit: number = PRODUCT_LINK_CANDIDATE_LIMIT): T[] {
  const textWords = foldedWords(text);
  const mentions = netContentMentions(text);
  return products
    .map((product) => {
      const nameScore = matchingWords(product.name, textWords);
      return {
        product,
        byName: nameScore > 0,
        score:
          nameScore +
          (product.brandName === null ? 0 : matchingWords(product.brandName, textWords)) +
          (product.netContent !== null && isNetContentMentioned(mentions, product.netContent)
            ? 1
            : 0),
      };
    })
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        Number(b.byName) - Number(a.byName) ||
        b.score - a.score ||
        compareSpanishText(a.product.name, b.product.name) ||
        compareSpanishText(a.product.id, b.product.id),
    )
    .slice(0, limit)
    .map(({ product }) => product);
}
