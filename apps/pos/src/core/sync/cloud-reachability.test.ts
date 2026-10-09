import { describe, expect, it } from "vitest";
import {
  type CloudReachability,
  INITIAL_CLOUD_REACHABILITY,
  nextCloudReachability,
} from "./cloud-reachability";
import type { PushAttempt } from "./push-to-cloud";

const ANSWERS_FROM_THE_CLOUD: PushAttempt[] = [
  { kind: "up_to_date" },
  { kind: "pushed", ackSeq: 3 },
  { kind: "ack_short_of_batch", ackSeq: 1 },
  { kind: "gap", expectedSeq: 2 },
  { kind: "stale_device" },
  { kind: "update_required" },
  { kind: "revoked" },
  { kind: "compromised" },
  { kind: "failed", failure: { kind: "refused", code: "rate_limited" } },
  { kind: "failed", failure: { kind: "unreadable" } },
];

const NOT_REACHING_THE_CLOUD: PushAttempt[] = [
  { kind: "no_cloud" },
  { kind: "not_enrolled" },
  { kind: "no_local_database" },
  { kind: "no_app_version" },
];

const REACHABILITIES: CloudReachability[] = ["unknown", "reachable", "unreachable"];

describe("the register's reach of the cloud", () => {
  it("is unknown until a push says otherwise", () => {
    expect(INITIAL_CLOUD_REACHABILITY).toBe("unknown");
  });

  it.each(REACHABILITIES)(
    "is unreachable after a push the cloud did not answer, from %s",
    (previous) => {
      expect(
        nextCloudReachability(previous, { kind: "failed", failure: { kind: "unreachable" } }),
      ).toBe("unreachable");
    },
  );

  it.each(
    ANSWERS_FROM_THE_CLOUD.flatMap((attempt) =>
      REACHABILITIES.map((previous) => [attempt, previous] as const),
    ),
  )("is reachable after the cloud answered %j, from %s", (attempt, previous) => {
    expect(nextCloudReachability(previous, attempt)).toBe("reachable");
  });

  it.each(
    NOT_REACHING_THE_CLOUD.flatMap((attempt) =>
      REACHABILITIES.map((previous) => [attempt, previous] as const),
    ),
  )("stays as it was when the push never tried the cloud (%j), from %s", (attempt, previous) => {
    expect(nextCloudReachability(previous, attempt)).toBe(previous);
  });
});
