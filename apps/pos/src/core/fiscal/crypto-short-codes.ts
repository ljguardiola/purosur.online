import { randomInt } from "node:crypto";
import type { ShortCodeRandomness } from "@purosur/domain/fiscal/use-cases";

export const cryptoShortCodes: ShortCodeRandomness = {
  nextIndex: (bound) => randomInt(bound),
};
