import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import { databaseRouteOptions } from "../app.js";
import { buildTestApp } from "./build-test-app.js";
import type { TestDatabase } from "./build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "./device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "./installation-keys-encryption-key.js";

export const APP_CLOCK = new Date("2020-06-15T12:00:00.000Z");

export const BACKOFFICE_ORIGIN = "https://staging.purosur.online";

const productionStaticDirs: string[] = [];

export function removeProductionStaticDirs(): void {
  for (const dir of productionStaticDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function buildProductionWiredApp(db: TestDatabase["db"]) {
  const staticDir = mkdtempSync(join(tmpdir(), "cloud-static-"));
  productionStaticDirs.push(staticDir);
  writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>backoffice</title>");
  return buildTestApp({
    now: () => APP_CLOCK,
    version: "abc1234",
    staticDir,
    ...databaseRouteOptions({
      db,
      backofficeOrigin: BACKOFFICE_ORIGIN,
      recoveryJobQueue: { async enqueueRecoveryRequest() {} },
      authorizedCuit: FICTIONAL_CERTIFICATE_CUIT,
      certificateFingerprint: "AA:BB",
      deviceTokenRotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
      installationKeysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    }),
  });
}
