import { isDeepStrictEqual } from "node:util";
import type { RestorationStandingAnswer } from "@purosur/contracts";

export interface RestorationStandingWatchDeps {
  read: () => RestorationStandingAnswer;
  onChanged: () => void;
}

export interface RestorationStandingWatch {
  check(): void;
}

export function createRestorationStandingWatch({
  read,
  onChanged,
}: RestorationStandingWatchDeps): RestorationStandingWatch {
  let last = read();
  return {
    check() {
      const current = read();
      if (!isDeepStrictEqual(current, last)) {
        last = current;
        onChanged();
      }
    },
  };
}
