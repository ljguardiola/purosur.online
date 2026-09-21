import { mainMessages } from "./messages";

export interface StartFailureOutput {
  readonly isPackaged: boolean;
  readonly writeError: (line: string) => void;
  readonly showErrorBox: (title: string, content: string) => void;
}

// The error box is a modal that holds main until it is dismissed, so it is only shown where staff
// are in front of the register; an unpackaged run (development, end-to-end tests) has the stderr
// line alone.
export function reportStartFailure(reason: string, output: StartFailureOutput): void {
  output.writeError(`register not started: ${reason}`);
  if (output.isPackaged) {
    output.showErrorBox(mainMessages.startFailure.title, mainMessages.startFailure.detail);
  }
}
