import { SHORT_CODE_ALPHABET } from "@purosur/domain";
import type { ShortCodeRandomness } from "@purosur/domain/fiscal/use-cases";

export function scriptedShortCodes(codes: readonly string[]): ShortCodeRandomness {
  const indexes = codes.flatMap((code) =>
    [...code].map((character) => SHORT_CODE_ALPHABET.indexOf(character)),
  );
  return {
    nextIndex: () => {
      const index = indexes.shift();
      if (index === undefined) {
        throw new Error("the scripted short codes ran out");
      }
      return index;
    },
  };
}
