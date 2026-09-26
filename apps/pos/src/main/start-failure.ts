import { mainMessages } from "./messages";

export interface StartFailureOutput {
  readonly isPackaged: boolean;
  readonly writeError: (line: string) => void;
  readonly showErrorBox: (title: string, content: string) => void;
}

// showErrorBox is a modal that blocks main until dismissed, so it only appears when staff are at
// the register; an unpackaged run (development, end-to-end tests) gets the stderr line alone.
export function reportStartFailure(reason: string, output: StartFailureOutput): void {
  output.writeError(`register not started: ${reason}`);
  if (output.isPackaged) {
    output.showErrorBox(mainMessages.startFailure.title, mainMessages.startFailure.detail);
  }
}
