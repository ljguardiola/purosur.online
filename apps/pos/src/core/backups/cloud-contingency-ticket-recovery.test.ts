import { cloudError } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import type { CloudResponse } from "../platform/cloud-client";
import { CloudContingencyTicketRecovery } from "./cloud-contingency-ticket-recovery";

const PREDECESSOR = "0190a000-0000-7000-8000-000000000001";

function askedWith(answer: CloudResponse) {
  const posts: { path: string; bearerToken: string; body: unknown }[] = [];
  const recovery = new CloudContingencyTicketRecovery({
    deviceToken: "prefix.secret",
    post: async (path, bearerToken, body) => {
      posts.push({ path, bearerToken, body });
      return answer;
    },
  });
  return { posts, status: recovery.ask(PREDECESSOR) };
}

describe("asking the cloud about the contingency ticket recovery", () => {
  it("names the predecessor to the cloud with the device's token", async () => {
    const { posts, status } = askedWith({ kind: "ok", body: { status: "awaiting" } });
    await status;

    expect(posts).toEqual([
      {
        path: "/api/devices/current/contingency-ticket-recovery",
        bearerToken: "prefix.secret",
        body: { predecessor_device_id: PREDECESSOR },
      },
    ]);
  });

  it.each(["awaiting", "finished"] as const)("reads the cloud's answer %s", async (state) => {
    const { status } = askedWith({ kind: "ok", body: { status: state } });

    expect(await status).toEqual({ kind: state });
  });

  it("reports an unreachable cloud as a failure", async () => {
    const { status } = askedWith({ kind: "unreachable" });

    expect(await status).toEqual({ kind: "failed", failure: { kind: "unreachable" } });
  });

  it("reports a refusal with the cloud's code", async () => {
    const { status } = askedWith({
      kind: "error",
      error: cloudError("predecessor_not_revoked", "predecessor_not_revoked"),
    });

    expect(await status).toMatchObject({
      kind: "failed",
      failure: { kind: "refused", code: "predecessor_not_revoked" },
    });
  });

  it("reports an answer it cannot read as a failure", async () => {
    const { status } = askedWith({ kind: "ok", body: { status: "done" } });

    expect(await status).toEqual({ kind: "failed", failure: { kind: "unreadable" } });
  });
});
