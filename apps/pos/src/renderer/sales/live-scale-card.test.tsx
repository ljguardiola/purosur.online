import type { LiveScaleReadingOutcome } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { LiveScaleCard } from "./live-scale-card";

function readingOf(outcome: LiveScaleReadingOutcome) {
  return vi.fn(async () => outcome);
}

describe("LiveScaleCard", () => {
  it("shows the weight the scale reads when no weighing is in progress", async () => {
    const screen = await render(
      <LiveScaleCard
        readScale={readingOf({ kind: "reading", weight_thousandths: 410, settled: true })}
        weighingReading={undefined}
      />,
    );

    await expect.element(screen.getByText("0,410 kg")).toBeVisible();
    expect(screen.container.textContent).toBe("Balanza0,410 kg");
  });

  it("shows a weight that has not settled", async () => {
    const screen = await render(
      <LiveScaleCard
        readScale={readingOf({ kind: "reading", weight_thousandths: 395, settled: false })}
        weighingReading={undefined}
      />,
    );

    await expect.element(screen.getByText("0,395 kg")).toBeVisible();
    expect(getComputedStyle(screen.getByText("0,395 kg").element()).opacity).toBe("0.65");
  });

  it("shows the card with no value while the scale settles", async () => {
    const screen = await render(
      <LiveScaleCard readScale={readingOf({ kind: "settling" })} weighingReading={undefined} />,
    );

    await expect.element(screen.getByText("Balanza")).toBeVisible();
    expect(screen.container.textContent).toBe("Balanza");
  });

  it("shows Sin lectura when the scale does not respond", async () => {
    const screen = await render(
      <LiveScaleCard readScale={readingOf({ kind: "no_reading" })} weighingReading={undefined} />,
    );

    await expect.element(screen.getByText("Sin lectura")).toBeVisible();
    expect(screen.container.textContent).toBe("BalanzaSin lectura");
  });

  it("shows Sin lectura when the core cannot be asked", async () => {
    const screen = await render(
      <LiveScaleCard
        readScale={vi.fn(async () => {
          throw new Error("the core is not answering");
        })}
        weighingReading={undefined}
      />,
    );

    await expect.element(screen.getByText("Sin lectura")).toBeVisible();
  });

  it("is not shown when the register has no scale", async () => {
    const readScale = readingOf({ kind: "not_configured" });
    const screen = await render(
      <LiveScaleCard readScale={readScale} weighingReading={undefined} />,
    );

    await expect.poll(() => readScale.mock.calls.length).toBeGreaterThan(0);
    expect(screen.container.textContent).toBe("");
  });

  it("shows nothing until the first reading arrives", async () => {
    const screen = await render(
      <LiveScaleCard readScale={() => new Promise(() => {})} weighingReading={undefined} />,
    );

    expect(screen.container.textContent).toBe("");
  });

  it("keeps reading the scale while no weighing is in progress", async () => {
    const readScale = readingOf({ kind: "settling" });
    await render(<LiveScaleCard readScale={readScale} weighingReading={undefined} />);

    await expect.poll(() => readScale.mock.calls.length).toBeGreaterThan(2);
  });

  it("shows the weighing's reading and leaves the scale alone while it lasts", async () => {
    const readScale = readingOf({ kind: "reading", weight_thousandths: 410, settled: true });
    const screen = await render(
      <LiveScaleCard
        readScale={readScale}
        weighingReading={{ weightThousandths: 1250, settled: true }}
      />,
    );

    await expect.element(screen.getByText("1,250 kg")).toBeVisible();
    expect(readScale).not.toHaveBeenCalled();
  });

  it("goes back to the live reading once the weighing ends", async () => {
    const readScale = readingOf({ kind: "reading", weight_thousandths: 410, settled: true });
    const screen = await render(
      <LiveScaleCard
        readScale={readScale}
        weighingReading={{ weightThousandths: 1250, settled: true }}
      />,
    );
    await expect.element(screen.getByText("1,250 kg")).toBeVisible();

    await screen.rerender(<LiveScaleCard readScale={readScale} weighingReading={undefined} />);

    await expect.element(screen.getByText("0,410 kg")).toBeVisible();
  });
});
