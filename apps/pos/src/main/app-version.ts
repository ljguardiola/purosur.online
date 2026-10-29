interface RunningApp {
  readonly isPackaged: boolean;
  readonly version: string;
}

// A release takes its patch from the run number of the packaging run, which a run from source
// has none of; its package.json patch is 0, which the cloud would read as the oldest release.
export function appVersionOf({ isPackaged, version }: RunningApp): string {
  if (isPackaged) {
    return version;
  }
  const [major, minor] = version.split(".");
  return `${major}.${minor}.${Number.MAX_SAFE_INTEGER}`;
}
