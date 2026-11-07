import type { ScaleReading } from "@purosur/domain/sales/use-cases";
import { describe, expect, it } from "vitest";
import { steadyScale } from "./steady-scale.js";

const START = new Date("2026-11-06T15:00:00.000Z").getTime();

function scriptedScale(...answers: Array<[ScaleReading, number]>) {
  let now = START;
  const device = {
    read(): Promise<ScaleReading> {
      const [reading, atMs] = answers.shift() ?? [{ kind: "unavailable" }, 0];
      now = START + atMs;
      return Promise.resolve(reading);
    },
  };
  return { device, clock: { now: () => new Date(now) } };
}

describe("steadyScale", () => {
  it("keeps showing a resting weight as stable through a discarded answer and the scale's own unstable mark", async () => {
    const { device, clock } = scriptedScale(
      [{ kind: "stable", weightThousandths: 1250 }, 0],
      [{ kind: "not_stable" }, 120],
      [{ kind: "unstable", weightThousandths: 1250 }, 170],
      [{ kind: "stable", weightThousandths: 1250 }, 210],
    );
    const scale = steadyScale(device, clock);

    expect(await scale.read()).toEqual({ kind: "stable", weightThousandths: 1250 });
    expect(await scale.read()).toEqual({ kind: "held_stable", weightThousandths: 1250 });
    expect(await scale.read()).toEqual({ kind: "held_stable", weightThousandths: 1250 });
    expect(await scale.read()).toEqual({ kind: "stable", weightThousandths: 1250 });
  });

  it("leaves stable at once when the weight changes, and holds nothing more until the next stable one", async () => {
    const { device, clock } = scriptedScale(
      [{ kind: "stable", weightThousandths: 1250 }, 0],
      [{ kind: "unstable", weightThousandths: 1400 }, 40],
      [{ kind: "not_stable" }, 80],
    );
    const scale = steadyScale(device, clock);

    await scale.read();
    expect(await scale.read()).toEqual({ kind: "unstable", weightThousandths: 1400 });
    expect(await scale.read()).toEqual({ kind: "not_stable" });
  });

  it("stops holding once answers stay not stable for longer than a brief blip", async () => {
    const { device, clock } = scriptedScale(
      [{ kind: "stable", weightThousandths: 1250 }, 0],
      [{ kind: "not_stable" }, 150],
      [{ kind: "not_stable" }, 301],
    );
    const scale = steadyScale(device, clock);

    await scale.read();
    expect(await scale.read()).toEqual({ kind: "held_stable", weightThousandths: 1250 });
    expect(await scale.read()).toEqual({ kind: "not_stable" });
  });
});
