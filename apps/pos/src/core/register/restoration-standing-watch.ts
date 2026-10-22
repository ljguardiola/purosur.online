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
      if (current.kind !== last.kind || stepOf(current) !== stepOf(last)) {
        last = current;
        onChanged();
      }
    },
  };
}

function stepOf(standing: RestorationStandingAnswer): string | undefined {
  return standing.kind === "in_progress" ? standing.step : undefined;
}
