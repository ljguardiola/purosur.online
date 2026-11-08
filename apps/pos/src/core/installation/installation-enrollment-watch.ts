import type { EnrollmentStandingAnswer } from "@purosur/contracts";

export interface InstallationEnrollmentWatchDeps {
  read: () => Promise<EnrollmentStandingAnswer>;
  onChanged: () => void;
}

export interface InstallationEnrollmentWatch {
  start(): Promise<void>;
  check(): Promise<void>;
}

export function createInstallationEnrollmentWatch({
  read,
  onChanged,
}: InstallationEnrollmentWatchDeps): InstallationEnrollmentWatch {
  let last: string | undefined;
  return {
    async start() {
      last = JSON.stringify(await read());
    },
    async check() {
      const current = JSON.stringify(await read());
      if (current !== last) {
        last = current;
        onChanged();
      }
    },
  };
}
