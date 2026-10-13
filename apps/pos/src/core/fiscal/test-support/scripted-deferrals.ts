import type { IdGenerator, ShortCodeRandomness } from "@purosur/domain/fiscal/use-cases";
import { scriptedShortCodes } from "./scripted-short-codes";

export const SCRIPTED_SHORT_CODES = ["7KQ4M2P9", "R3XW8H5N", "ABCDEFGH"] as const;

export function scriptedDeferrals(): { ids: IdGenerator; shortCodes: ShortCodeRandomness } {
  let issued = 0;
  return {
    ids: {
      next: () => {
        issued += 1;
        return `deferred-${issued}`;
      },
    },
    shortCodes: scriptedShortCodes(SCRIPTED_SHORT_CODES),
  };
}
