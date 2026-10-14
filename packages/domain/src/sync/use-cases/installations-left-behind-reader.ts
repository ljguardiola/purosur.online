export interface InstallationLeftBehind {
  registerName: string;
  appVersion: string | null;
}

export interface InstallationsLeftBehindReader {
  installationsLeftBehindBy(minimum: string): Promise<InstallationLeftBehind[]>;
}
