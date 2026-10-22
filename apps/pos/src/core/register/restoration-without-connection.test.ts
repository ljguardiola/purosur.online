import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRestoreAttempts } from "../backups/restore-attempts";
import { restorePendingIn } from "../backups/restore-pending";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { type CloudReachability, INITIAL_CLOUD_REACHABILITY } from "../sync/cloud-reachability";
import { restorationStandingFor } from "./restoration-standing-requests";
import { createRestorationStandingWatch } from "./restoration-standing-watch";
import { SqliteRestorationEvidence } from "./sqlite-restoration-evidence";

let database: LocalDatabase;
let folder: string;

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  folder = mkdtempSync(join(tmpdir(), "purosur-pos-restoration-offline-"));
});

afterEach(() => {
  database.close();
  rmSync(folder, { recursive: true, force: true });
});

function restoringRegister() {
  const pending = restorePendingIn(folder);
  pending.begin("device-b");
  let cloud: CloudReachability = INITIAL_CLOUD_REACHABILITY;
  const attempts = createRestoreAttempts({
    pending,
    launch: async () => true,
    restartCore: () => undefined,
    resumeSync: () => undefined,
    reportNoUsableGeneration: () => undefined,
    cloudAnswered: (reachable) => {
      cloud = reachable ? "reachable" : "unreachable";
    },
  });
  const evidence = new SqliteRestorationEvidence(
    database,
    pending,
    () => cloud,
    attempts.noUsableGeneration,
  );
  const onChanged = vi.fn();
  const watch = createRestorationStandingWatch({
    read: () => restorationStandingFor(evidence),
    onChanged,
  });
  return { attempts, evidence, watch, onChanged };
}

describe("a restoring register and the cloud", () => {
  it("stays in progress, saying nothing, until a restore reports the cloud unreachable", async () => {
    const { attempts, evidence, watch, onChanged } = restoringRegister();
    await attempts.attempt();

    watch.check();

    expect(restorationStandingFor(evidence)).toEqual({ kind: "in_progress", step: "restore" });
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("goes without connection once a restore could not reach the cloud, and says so", async () => {
    const { attempts, evidence, watch, onChanged } = restoringRegister();
    await attempts.attempt();

    attempts.workerExited("unreachable");
    watch.check();

    expect(restorationStandingFor(evidence)).toEqual({
      kind: "without_connection",
      step: "restore",
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("goes failed once no snapshot generation could be used, and says so", async () => {
    const { attempts, evidence, watch, onChanged } = restoringRegister();
    await attempts.attempt();

    attempts.workerExited("none_usable");
    watch.check();

    expect(restorationStandingFor(evidence)).toEqual({ kind: "failed", step: "restore" });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});
