import type { FiscalEmissionModeKind } from "@purosur/domain";

export interface FiscalModeWatchDeps {
  read: () => FiscalEmissionModeKind;
  onChanged: () => void;
}

export interface FiscalModeWatch {
  check(): void;
}

export function createFiscalModeWatch({ read, onChanged }: FiscalModeWatchDeps): FiscalModeWatch {
  let last = read();
  return {
    check() {
      const current = read();
      if (current !== last) {
        last = current;
        onChanged();
      }
    },
  };
}
