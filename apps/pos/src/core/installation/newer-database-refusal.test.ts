import { describe, expect, it } from "vitest";
import { refuseNewerDatabase } from "./newer-database-refusal";

function recorder() {
  const posted: unknown[] = [];
  const logged: string[] = [];
  return {
    posted,
    logged,
    deps: {
      post: (message: unknown) => posted.push(message),
      log: (line: string) => logged.push(line),
    },
  };
}

describe("refuseNewerDatabase", () => {
  it("tells main the core refused a database migrated by a newer version and stops the start", () => {
    const { posted, logged, deps } = recorder();

    expect(refuseNewerDatabase({ kind: "newer_than_version" }, deps)).toBe(true);
    expect(posted).toEqual([{ type: "core-refused", reason: "newer_database" }]);
    expect(logged).toEqual(["core: refusing a local database migrated by a newer version"]);
  });

  it.each([
    ["a damaged database", { kind: "out_of_service" } as const],
    ["no database", undefined],
  ])("lets the start go on, telling nothing, for %s", (_case, started) => {
    const { posted, logged, deps } = recorder();

    expect(refuseNewerDatabase(started, deps)).toBe(false);
    expect(posted).toEqual([]);
    expect(logged).toEqual([]);
  });
});
