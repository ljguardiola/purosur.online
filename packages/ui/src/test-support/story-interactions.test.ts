import { describe, expect, it } from "vitest";
import { playWithClockAt } from "./story-interactions";

const canvasElement = {} as HTMLElement;

describe("playWithClockAt", () => {
  it("answers the current instant with the pinned date while the play function runs", async () => {
    const seen: string[] = [];
    await playWithClockAt("2026-06-15T12:00:00Z", async () => {
      seen.push(new Date(Date.now()).toISOString(), new Date().toISOString());
    })({ canvasElement });

    expect(seen).toEqual(["2026-06-15T12:00:00.000Z", "2026-06-15T12:00:00.000Z"]);
  });

  it("builds a date from its parts the same way the real clock does", async () => {
    const built: number[] = [];
    await playWithClockAt("2026-06-15T12:00:00Z", async () => {
      built.push(
        new Date(2027, 1, 10).getTime(),
        new Date(2027, 1, 10, 9, 30, 15, 250).getTime(),
        new Date("2027-02-10T00:00:00Z").getTime(),
        new Date(0).getTime(),
      );
    })({ canvasElement });

    expect(built).toEqual([
      new Date(2027, 1, 10).getTime(),
      new Date(2027, 1, 10, 9, 30, 15, 250).getTime(),
      Date.UTC(2027, 1, 10),
      0,
    ]);
  });

  it("puts the real clock back once the play function ends", async () => {
    const RealDate = Date;
    await playWithClockAt("2026-06-15T12:00:00Z", async () => {})({ canvasElement });

    expect(Date).toBe(RealDate);
  });
});
