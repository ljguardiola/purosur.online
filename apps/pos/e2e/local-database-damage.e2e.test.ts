import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CORE_DAMAGED,
  loggedAStartOutcome,
  startOutcomesIn,
} from "./test-support/core-start-outcomes";
import { type EnrolledRegister, enrolledRegister } from "./test-support/enrolled-register";
import { type StandInCloud, startStandInCloud } from "./test-support/stand-in-cloud";
import { untilLogged } from "./test-support/until";

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
  });

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

    await untilLogged(register, loggedAStartOutcome);
    expect(startOutcomesIn(register.logs.join(""))).toEqual([CORE_DAMAGED]);
    await register.page.getByText("La caja necesita restaurarse", { exact: true }).waitFor();
    expect(cloud.requests.slice(requestsBefore)).not.toContainEqual(
      expect.stringMatching(/^(POST \/api\/events|GET \/api\/changes)$/),
    );
  });
});
