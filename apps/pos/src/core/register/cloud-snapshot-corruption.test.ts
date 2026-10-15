import { cloudError } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import type { CloudResponse } from "../platform/cloud-client";
import { cloudSnapshotCorruption } from "./cloud-snapshot-corruption";

function setup(answer: CloudResponse, token: string | null = "prefix.secret") {
  const posts: { path: string; bearerToken: string; body: unknown }[] = [];
  const cloud = cloudSnapshotCorruption({
    readDeviceToken: async () => token ?? undefined,
    post: async (path, bearerToken, body) => {
      posts.push({ path, bearerToken, body });
      return answer;
    },
  });
  return { cloud, posts };
}

describe("cloudSnapshotCorruption", () => {
  it("tells the cloud, with the device token, the stage that failed", async () => {
    const { cloud, posts } = setup({ kind: "ok", body: undefined });

    expect(await cloud.report("integrity_check")).toBe("done");
    expect(posts).toEqual([
      {
        path: "/api/devices/current/snapshot-corruption",
        bearerToken: "prefix.secret",
        body: { stage: "integrity_check" },
      },
    ]);
  });

  it("reports an unreachable cloud as unreachable", async () => {
    expect(await setup({ kind: "unreachable" }).cloud.report("copy")).toBe("unreachable");
  });

  it("reports a refusal of the cloud as failed", async () => {
    const error = cloudError("internal_error", "no");

    expect(await setup({ kind: "error", error }).cloud.report("copy")).toBe("failed");
  });

  it("sends nothing and fails while the register holds no device token", async () => {
    const { cloud, posts } = setup({ kind: "ok", body: undefined }, null);

    expect(await cloud.report("copy")).toBe("failed");
    expect(posts).toEqual([]);
  });
});
