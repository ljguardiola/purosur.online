import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type EnrolledRegister, enrolledRegister } from "./test-support/enrolled-register";
import { type StandInCloud, startStandInCloud } from "./test-support/stand-in-cloud";

async function replaceDatabaseWithBytesThatAreNotOne(localDataFolder: string): Promise<void> {
  const database = join(localDataFolder, "register.sqlite");
  await rm(`${database}-wal`, { force: true });
  await rm(`${database}-shm`, { force: true });
  await writeFile(database, "these bytes are not a database ".repeat(500));
}

describe("a register whose local database is damaged", () => {
  let cloud: StandInCloud;
  let register: EnrolledRegister;

  beforeAll(async () => {
    cloud = await startStandInCloud([]);
    register = enrolledRegister(cloud);
    await register.launch();
  }, 60_000);

  afterAll(async () => {
    try {
      await register?.close();
    } finally {
      await cloud?.stop();
    }
  });

  it("starts out of service, says it needs restoring and pushes nothing to the cloud", async () => {
    let requestsBefore = 0;

    await register.restartAfter(async (localDataFolder) => {
      await cloud.dropEveryConnection();
      requestsBefore = cloud.requests.length;
      await replaceDatabaseWithBytesThatAreNotOne(localDataFolder);
    });

    await register.page.getByText("La caja necesita restaurarse", { exact: true }).waitFor();
    await vi.waitFor(
      () => {
        expect(register.logs.join("")).toContain(
          "core: the local database is damaged, so the register is out of service",
        );
      },
      { timeout: 20_000, interval: 100 },
    );
    expect(cloud.requests.slice(requestsBefore)).not.toContainEqual(
      expect.stringMatching(/^(POST \/api\/events|GET \/api\/changes)$/),
    );
  });
});
