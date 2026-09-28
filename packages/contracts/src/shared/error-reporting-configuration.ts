export type ErrorReportingConfiguration =
  | { enabled: false }
  | { enabled: true; dsn: string; environment: string; release: string };
