export function registerEyebrow(registerName: string | null, standing?: string): string {
  if (standing === undefined) {
    return registerName === null ? "CAJA" : registerName.toUpperCase();
  }
  return registerName === null ? standing : `${registerName.toUpperCase()} · ${standing}`;
}
