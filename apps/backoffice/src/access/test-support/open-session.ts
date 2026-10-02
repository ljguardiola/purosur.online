import type { SessionOutcome } from "../session-api";
import { ADMINISTRATOR_CAPABILITIES } from "./backoffice-access";

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
    expiresAt: new Date(Date.now() + SESSION_IDLE_TIMEOUT_MS).toISOString(),
    ...overrides,
  };
}
