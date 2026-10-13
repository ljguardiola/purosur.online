import type { InitialCountLine } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { CoreData } from "../platform/use-core-query";
import { InitialCountSummaryPanel } from "./initial-count-summary-panel";

function line(movement: string, product: string, expiresOn: string | null): InitialCountLine {
  return {
    movement_id: movement,
    product_id: product,
    product_name: "Producto",
    sale_unit: "UNIT",
    counted: 1000,
    expires_on: expiresOn,
  };
}

async function renderPanel(state: CoreData<InitialCountLine[]>, onFinish = vi.fn()) {
  await page.viewport(1280, 720);
  const screen = await render(<InitialCountSummaryPanel state={state} onFinish={onFinish} />);
  return { screen, onFinish };
}

describe("InitialCountSummaryPanel", () => {
  it("totals the lines and tells how many products and how many lines have an expiry", async () => {
    const { screen } = await renderPanel({
      status: "loaded",
      refreshing: false,
      value: [
        line("m1", "a", "2026-12-01"),
        line("m2", "a", "2027-01-01"),
        line("m3", "b", "2026-11-01"),
        line("m4", "c", null),
      ],
    });

    await expect.element(screen.getByText("Cargado hasta ahora")).toBeVisible();
    await expect.element(screen.getByText("4 líneas", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Productos distintos")).toBeVisible();
    await expect.element(screen.getByText("Con vencimiento")).toBeVisible();
    await expect.element(screen.getByText("3 líneas", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Sin vencimiento")).toBeVisible();
    await expect.element(screen.getByText("1 línea", { exact: true })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("writes how many distinct products were counted as a number of the register's language", async () => {
    const { screen } = await renderPanel({
      status: "loaded",
      refreshing: false,
      value: Array.from({ length: 1200 }, (_, index) => line(`m${index}`, `p${index}`, null)),
    });

    await expect.element(screen.getByText("1.200", { exact: true })).toBeVisible();
  });

  it("adds no note under the totals", async () => {
    const { screen } = await renderPanel({ status: "loaded", refreshing: false, value: [] });

    await expect.element(screen.getByText("Sin vencimiento")).toBeVisible();
    expect(screen.getByText(/se guarda|dos vencimientos/).query()).toBeNull();
  });

  it("finishes the count from the button", async () => {
    const { screen, onFinish } = await renderPanel({
      status: "loaded",
      refreshing: false,
      value: [],
    });

    await userEvent.click(screen.getByRole("button", { name: "Terminar la carga" }));

    expect(onFinish).toHaveBeenCalledOnce();
  });

  it("keeps the button while the lines load or could not be read", async () => {
    const loading = await renderPanel({ status: "loading" });
    await expect
      .element(loading.screen.getByRole("button", { name: "Terminar la carga" }))
      .toBeEnabled();
    await loading.screen.unmount();

    const failed = await renderPanel({ status: "failed", retry: vi.fn() });
    await expect
      .element(failed.screen.getByRole("button", { name: "Terminar la carga" }))
      .toBeEnabled();
    await expect.element(failed.screen.getByText("Cargado hasta ahora")).toBeVisible();
  });
});
