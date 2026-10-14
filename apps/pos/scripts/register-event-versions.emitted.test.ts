import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { READABLE_EVENT_VERSIONS } from "@purosur/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { emittedEventVersions } from "./register-event-versions.js";

const REPO_DIR = fileURLToPath(new URL("../../../", import.meta.url));
const MODULE = fileURLToPath(new URL("./register-event-versions.ts", import.meta.url));

describe("the event versions a checkout's register emits", { timeout: 0 }, () => {
  let emitted: string[];

  beforeAll(() => {
    emitted = emittedEventVersions(REPO_DIR);
  }, 0);

  it("are written event_type@schema_version, sorted, each once", () => {
    expect(emitted).toContain("sale_completed@8");
    expect(emitted.every((version) => /^[a-z_]+@[1-9]\d*$/.test(version))).toBe(true);
    expect(emitted).toEqual([...new Set(emitted)].sort());
  });

  it("are all versions the cloud reads", () => {
    expect(emitted.filter((version) => !READABLE_EVENT_VERSIONS.includes(version))).toEqual([]);
  });

  it("are printed as a JSON array by running the module on a checkout's root", () => {
    const printed = execFileSync(process.execPath, [MODULE, REPO_DIR], { encoding: "utf8" });

    expect(JSON.parse(printed)).toEqual(emitted);
  });
});
