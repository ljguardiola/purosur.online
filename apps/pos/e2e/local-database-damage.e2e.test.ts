import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CORE_DAMAGED, coreStartEnded, startEndingsIn } from "./test-support/core-start-outcomes";
import { type EnrolledRegister, enrolledRegister } from "./test-support/enrolled-register";
import { type StandInCloud, startStandInCloud } from "./test-support/stand-in-cloud";
import { until, untilLogged } from "./test-support/until";

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

  it("starts out of service, says it needs restoring, tells the cloud it can't sell and never pulls", async () => {
    let requestsBefore = 0;
    let pushesBefore = 0;

    await register.restartAfter(async (localDataFolder) => {
      await cloud.dropEveryConnection();
      requestsBefore = cloud.requests.length;
      pushesBefore = cloud.eventPushes.length;
      await replaceDatabaseWithBytesThatAreNotOne(localDataFolder);
    });

    await untilLogged(register, coreStartEnded);
    expect(startEndingsIn(register.logs.join(""))).toEqual([CORE_DAMAGED]);
    await register.page.getByText("La caja necesita restaurarse", { exact: true }).waitFor();
    const damageReports = () =>
      cloud.eventPushes
        .slice(pushesBefore)
        .filter((push) => push.telemetry.sales_denied_reason === "local_database_damaged");
    const reportsSpanningAWholeSyncCycle = 2;
    await until(() => damageReports().length >= reportsSpanningAWholeSyncCycle);
    expect(damageReports()[0]).toMatchObject({
      events: [],
      telemetry: { sales_denied: true, sales_denied_reason: "local_database_damaged" },
    });
    expect(cloud.requests.slice(requestsBefore)).not.toContain("GET /api/changes");
  });
});
