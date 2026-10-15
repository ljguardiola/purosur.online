import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { vi } from "vitest";
import { render } from "../../shell/test-support/render-with-router";
import { registerKey } from "../register-queries";
import type {
  SnapshotBackupGeneration,
  SnapshotBackupRegister,
  SnapshotBackups,
} from "../snapshot-backups-api";
import { SnapshotBackupsScreen } from "../snapshot-backups-screen";
import type { SnapshotBackupsScreenServices } from "../snapshot-backups-services";

export function createAuthorizationServices() {
  return {
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
  };
}

export function createServices(
  overrides: Partial<SnapshotBackupsScreenServices> = {},
): SnapshotBackupsScreenServices {
  return {
    fetchSnapshotBackupRegisters: vi.fn(),
    fetchSnapshotBackups: vi.fn(),
    changeSnapshotLifecycleRules: vi.fn(),
    rotateSnapshotKey: vi.fn(),
    ...createAuthorizationServices(),
    ...overrides,
  };
}

export const caja1: SnapshotBackupRegister = { id: "register-1", name: "Caja 1" };
export const caja2: SnapshotBackupRegister = { id: "register-2", name: "Caja 2" };

export const verifiedGeneration: SnapshotBackupGeneration = {
  id: "generation-1",
  createdAt: "2026-09-16T15:55:00.000Z",
  size: 193_986_560,
  status: "verified",
  countsForRestore: true,
};
export const failedGeneration: SnapshotBackupGeneration = {
  id: "generation-2",
  createdAt: "2026-09-16T15:45:00.000Z",
  size: 192_937_984,
  status: "failed",
  countsForRestore: false,
};
export const verifyingGeneration: SnapshotBackupGeneration = {
  id: "generation-3",
  createdAt: "2026-09-16T16:00:00.000Z",
  size: 195_035_136,
  status: "uploaded",
  countsForRestore: false,
};
export const declaredGeneration: SnapshotBackupGeneration = {
  id: "generation-4",
  createdAt: "2026-09-16T16:05:00.000Z",
  size: 195_035_136,
  status: "declared",
  countsForRestore: false,
};

export const backups: SnapshotBackups = {
  rules: { hourly: 24, daily: 30, monthly: 12 },
  tiers: { recent: 6, hourly: 24, daily: 30, monthly: 2 },
  generations: [verifiedGeneration, failedGeneration],
};

const authorizationOptions = { challenge: "session-auth" } as never;
const assertion = { id: "existing-cred" } as never;

export function grantAuthorization(services: {
  fetchSessionAuthorizationOptions: SnapshotBackupsScreenServices["fetchSessionAuthorizationOptions"];
  authorizeSession: SnapshotBackupsScreenServices["authorizeSession"];
  startAuthentication: SnapshotBackupsScreenServices["startAuthentication"];
}) {
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
}

function FetchesInFlight() {
  return <output aria-label="Lecturas en curso">{useIsFetching()}</output>;
}

function RefreshRegisters() {
  const client = useQueryClient();
  return (
    <button type="button" onClick={() => void client.invalidateQueries({ queryKey: registerKey })}>
      Refrescar
    </button>
  );
}

export function renderScreen(
  services: SnapshotBackupsScreenServices,
  {
    register = "",
    onRegisterChange = () => {},
    onSessionEnded = () => {},
  }: {
    register?: string;
    onRegisterChange?: (register: string) => void;
    onSessionEnded?: () => void;
  } = {},
) {
  return render(
    <main>
      <SnapshotBackupsScreen
        filters={{ register }}
        onFiltersChange={({ register }) => onRegisterChange(register)}
        services={services}
        onSessionEnded={onSessionEnded}
      />
      <FetchesInFlight />
      <RefreshRegisters />
    </main>,
  );
}

export function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
