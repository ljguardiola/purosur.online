const launched: (readonly string[])[] = [];

export function recordLaunchedRegister(logs: readonly string[]): void {
  launched.push(logs);
}

export function launchedRegisters(): readonly (readonly string[])[] {
  return launched;
}
