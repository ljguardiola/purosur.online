export interface RegisterHealthCheck {
  checkedAt: Date;
  roundTripMs: number;
  tokenValid: boolean;
  arcaReachable: boolean;
}

export interface RegisterHealthChecks {
  recordHealthCheck(check: RegisterHealthCheck, keepLast: number): Promise<void>;
}

export interface RegisterHealthCheckPorts {
  healthChecks: RegisterHealthChecks;
}
