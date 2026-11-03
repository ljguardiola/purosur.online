import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { BrandPanelScreen } from "./brand-panel-screen";

afterEach(() => {
  vi.useRealTimers();
});

describe("BrandPanelScreen", () => {
  it("shows the brand panel's logo with its accessible name", async () => {
    const screen = await render(<BrandPanelScreen />);

    await expect.element(screen.getByRole("img", { name: "Puro Sur" })).toBeVisible();

    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows its content beside the brand panel", async () => {
    const screen = await render(
      <BrandPanelScreen>
        <p>content</p>
      </BrandPanelScreen>,
    );

    await expect.element(screen.getByText("content")).toBeVisible();
  });

  it("shows the installation's status under the logo, with the local time", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(2026, 8, 29, 9, 0, 30));

    const screen = await render(<BrandPanelScreen status="Sin dar de alta" />);

    await expect.element(screen.getByText("Sin dar de alta")).toBeVisible();
    await expect.element(screen.getByText("09:00")).toBeVisible();
  });

  it("keeps the status and time accessible", async () => {
    const screen = await render(<BrandPanelScreen status="Sin dar de alta" />);
    await expect.element(screen.getByRole("contentinfo")).toBeVisible();

    await expectNoAccessibilityViolations(screen.container);
  });

  it("moves its clock on when the minute changes", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(2026, 8, 29, 9, 0, 30));
    const screen = await render(<BrandPanelScreen status="Sin dar de alta" />);
    await expect.element(screen.getByText("09:00")).toBeVisible();

    await vi.advanceTimersByTimeAsync(30_000);

    await expect.element(screen.getByText("09:01")).toBeVisible();
  });

  it("shows no status or time when it is given no status", async () => {
    const screen = await render(<BrandPanelScreen />);

    await expect.element(screen.getByRole("contentinfo")).not.toBeInTheDocument();
  });

  it("shows the version at the bottom of the brand panel without a status or a clock", async () => {
    const screen = await render(<BrandPanelScreen version="1.0.1539" />);

    await expect.element(screen.getByText("Versión 1.0.1539")).toBeVisible();
    await expect.element(screen.getByRole("contentinfo")).toBeVisible();
    await expect.element(screen.getByRole("time")).not.toBeInTheDocument();

    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows the version beside the status and the time", async () => {
    const screen = await render(<BrandPanelScreen status="Sin dar de alta" version="1.0.1539" />);

    await expect.element(screen.getByText("Sin dar de alta")).toBeVisible();
    await expect.element(screen.getByText("Versión 1.0.1539")).toBeVisible();
  });

  it("shows no version when it is given none", async () => {
    const screen = await render(<BrandPanelScreen version={null} />);

    await expect.element(screen.getByText(/Versión/)).not.toBeInTheDocument();
    await expect.element(screen.getByRole("contentinfo")).not.toBeInTheDocument();
  });
});
