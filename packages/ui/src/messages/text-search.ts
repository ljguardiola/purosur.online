import { foldedText } from "@purosur/formatting";

export function textContains(text: string, query: string): boolean {
  return foldedText(text).includes(foldedText(query));
}
