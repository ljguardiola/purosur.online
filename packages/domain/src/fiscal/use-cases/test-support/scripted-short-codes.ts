import { SHORT_CODE_ALPHABET } from "../../model/deferred-sale.js";
import type { ShortCodeRandomness } from "../deferred-sale-ports.js";

export class ScriptedShortCodes implements ShortCodeRandomness {
  private readonly indexes: number[];

  constructor(codes: readonly string[]) {
    this.indexes = codes.flatMap((code) =>
      [...code].map((character) => SHORT_CODE_ALPHABET.indexOf(character)),
    );
  }

  nextIndex(): number {
    const index = this.indexes.shift();
    if (index === undefined) {
      throw new Error("the scripted short codes ran out");
    }
    return index;
  }
}
