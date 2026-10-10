import { describe, expect, it } from "vitest";
import { pushForRegisterService } from "./push-for-register-service";
import type { PushAttempt } from "./push-to-cloud";

function pushes() {
  const ran: string[] = [];
  return {
    ran,
    pushOutbox: async (): Promise<PushAttempt> => {
      ran.push("outbox");
      return { kind: "pushed", ackSeq: 3 };
    },
    reportDamagedDatabase: async (): Promise<PushAttempt> => {
      ran.push("damaged database report");
      return { kind: "up_to_date" };
    },
  };
}

describe("the push of a register", () => {
  it("pushes the outbox of a register in service", async () => {
    const { ran, ...deps } = pushes();

    const attempt = await pushForRegisterService({ service: { kind: "in_service" }, ...deps });

    expect(attempt).toEqual({ kind: "pushed", ackSeq: 3 });
    expect(ran).toEqual(["outbox"]);
  });

  it("reports the damaged database of a register out of service instead of its outbox", async () => {
    const { ran, ...deps } = pushes();

    const attempt = await pushForRegisterService({ service: { kind: "out_of_service" }, ...deps });

    expect(attempt).toEqual({ kind: "up_to_date" });
    expect(ran).toEqual(["damaged database report"]);
  });

  it("pushes nothing from a register out of service with no database to report about", async () => {
    const { ran, pushOutbox } = pushes();

    const attempt = await pushForRegisterService({
      service: { kind: "out_of_service" },
      pushOutbox,
      reportDamagedDatabase: undefined,
    });

    expect(attempt).toEqual({ kind: "no_local_database" });
    expect(ran).toEqual([]);
  });
});
