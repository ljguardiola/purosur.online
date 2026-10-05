import { ADMINISTRATOR_CAPABILITIES } from "../../shell/test-support/backoffice-access";
import type { SessionOutcome } from "../session-api";

type OpenSession = Extract<SessionOutcome, { kind: "ok" }>;

const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export function openSession(overrides: Partial<Omit<OpenSession, "kind">> = {}): OpenSession {
  const isAdministrator = overrides.isAdministrator ?? true;
  return {
    kind: "ok",
    userId: "user-1",
    displayName: "Lucas Guardiola",
    isAdministrator,
    capabilities: isAdministrator ? ADMINISTRATOR_CAPABILITIES : [],
    stockMovementKinds: isAdministrator ? ["loss", "adjustment"] : [],
    mayEmitOwnPinCode: isAdministrator,
    expiresAt: new Date(Date.now() + SESSION_IDLE_TIMEOUT_MS).toISOString(),
    ...overrides,
  };
}
