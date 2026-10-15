import { describe, expect, it } from "vitest";
import { recordOffsiteDumpCheck } from "./record-offsite-dump-check.js";
import { FakeOffsiteDumpCheckStore } from "./test-support/fake-offsite-dump-check-store.js";

describe("recordOffsiteDumpCheck", () => {
  it("records a passed check with no earlier night of known size as verified with its size", async () => {
    const store = new FakeOffsiteDumpCheckStore();

    const outcome = await recordOffsiteDumpCheck(
      { store },
      { night: "2026-10-14", check: { outcome: "passed", sizeBytes: 900 } },
    );

    expect(outcome).toEqual({ kind: "verified", night: "2026-10-14", sizeBytes: 900 });
    expect(store.snapshot()).toEqual({ "2026-10-14": { status: "verified", sizeBytes: 900 } });
  });

  it("records a failed check with the reason it reported", async () => {
    const store = new FakeOffsiteDumpCheckStore();

    const outcome = await recordOffsiteDumpCheck(
      { store },
      { night: "2026-10-14", check: { outcome: "failed", reason: "decryption_failed" } },
    );

    expect(outcome).toEqual({ kind: "failed", night: "2026-10-14", reason: "decryption_failed" });
    expect(store.snapshot()).toEqual({
      "2026-10-14": { status: "failed", reason: "decryption_failed" },
    });
  });

  it("fails a passed check that shrank below half the latest earlier night, recording its size", async () => {
    const store = new FakeOffsiteDumpCheckStore({
      "2026-10-13": { status: "verified", sizeBytes: 1_000 },
    });

    const outcome = await recordOffsiteDumpCheck(
      { store },
      { night: "2026-10-14", check: { outcome: "passed", sizeBytes: 499 } },
    );

    expect(outcome).toEqual({ kind: "failed", night: "2026-10-14", reason: "shrank" });
    expect(store.snapshot()["2026-10-14"]).toEqual({
      status: "failed",
      reason: "shrank",
      sizeBytes: 499,
    });
  });

  it("compares the night after a shrank one with the shrank night's size, so a dump that stays smaller is verified", async () => {
    const store = new FakeOffsiteDumpCheckStore({
      "2026-10-12": { status: "verified", sizeBytes: 1_000 },
      "2026-10-13": { status: "failed", reason: "shrank", sizeBytes: 400 },
    });

    const outcome = await recordOffsiteDumpCheck(
      { store },
      { night: "2026-10-14", check: { outcome: "passed", sizeBytes: 400 } },
    );

    expect(outcome).toEqual({ kind: "verified", night: "2026-10-14", sizeBytes: 400 });
  });

  it("compares with the latest earlier night of known size, skipping nights that failed before their size was known and ignoring later ones", async () => {
    const store = new FakeOffsiteDumpCheckStore({
      "2026-10-10": { status: "verified", sizeBytes: 100_000 },
      "2026-10-12": { status: "verified", sizeBytes: 1_000 },
      "2026-10-13": { status: "failed", reason: "hash_mismatch" },
      "2026-10-15": { status: "verified", sizeBytes: 900_000 },
    });

    const outcome = await recordOffsiteDumpCheck(
      { store },
      { night: "2026-10-14", check: { outcome: "passed", sizeBytes: 500 } },
    );

    expect(outcome).toEqual({ kind: "verified", night: "2026-10-14", sizeBytes: 500 });
  });

  it("replaces the result of a night reported again", async () => {
    const store = new FakeOffsiteDumpCheckStore({
      "2026-10-14": { status: "failed", reason: "object_missing" },
    });

    const outcome = await recordOffsiteDumpCheck(
      { store },
      { night: "2026-10-14", check: { outcome: "passed", sizeBytes: 800 } },
    );

    expect(outcome).toEqual({ kind: "verified", night: "2026-10-14", sizeBytes: 800 });
    expect(store.snapshot()).toEqual({ "2026-10-14": { status: "verified", sizeBytes: 800 } });
  });

  it("does not compare a night with its own earlier result when it is reported again", async () => {
    const store = new FakeOffsiteDumpCheckStore({
      "2026-10-14": { status: "verified", sizeBytes: 10_000 },
    });

    const outcome = await recordOffsiteDumpCheck(
      { store },
      { night: "2026-10-14", check: { outcome: "passed", sizeBytes: 100 } },
    );

    expect(outcome).toEqual({ kind: "verified", night: "2026-10-14", sizeBytes: 100 });
  });

  it("leaves the recorded results untouched when recording fails", async () => {
    const store = new FakeOffsiteDumpCheckStore({
      "2026-10-13": { status: "verified", sizeBytes: 1_000 },
    });
    store.failNextRecording = true;

    await expect(
      recordOffsiteDumpCheck(
        { store },
        { night: "2026-10-14", check: { outcome: "passed", sizeBytes: 900 } },
      ),
    ).rejects.toThrow("storage unavailable");

    expect(store.snapshot()).toEqual({ "2026-10-13": { status: "verified", sizeBytes: 1_000 } });
  });
});
