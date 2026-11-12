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
  const onClose = vi.fn();
  const screen = await render(
    <div style={{ height: 600, display: "flex", justifyContent: "flex-end" }}>
      <InitialCountSummaryPanel state={state} onFinish={onFinish} onClose={onClose} />
    </div>,
  );
  return { screen, onFinish, onClose };
}

function rowsOf(screen: Awaited<ReturnType<typeof renderPanel>>["screen"]) {
  return ["Productos distintos", "Con vencimiento", "Sin vencimiento"].map((label) => [
    label,
    screen.getByText(label, { exact: true }).element().nextElementSibling?.textContent,
  ]);
}

describe("InitialCountSummaryPanel", () => {
  it("titles the panel Inventario inicial with the Esc keycap at its right, which closes the screen", async () => {
    const { screen, onClose } = await renderPanel({
      status: "loaded",
      refreshing: false,
      value: [],
    });

    await expect
      .element(screen.getByRole("heading", { level: 2, name: "Inventario inicial" }))
      .toBeVisible();
    const close = screen.getByRole("button", { name: "Cerrar con Esc" });
    expect(close.element().querySelector("kbd")?.textContent).toBe("Esc");
    await userEvent.click(close);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows the finish button with its F12 keycap and the check icon before its text", async () => {
    const { screen } = await renderPanel({ status: "loaded", refreshing: false, value: [] });

    const finish = screen.getByRole("button", { name: "Terminar la carga" }).element();
    expect(finish.querySelector("kbd")?.textContent).toBe("F12");
    expect(
      finish
        .querySelector("svg")
        ?.compareDocumentPosition(finish.querySelector("span.truncate") as Node),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("shows nothing but zeros while no line is counted", async () => {
    const { screen } = await renderPanel({ status: "loaded", refreshing: false, value: [] });

    await expect.element(screen.getByText("0 líneas", { exact: true })).toBeVisible();
    expect(rowsOf(screen)).toEqual([
      ["Productos distintos", "0"],
      ["Con vencimiento", "0"],
      ["Sin vencimiento", "0"],
    ]);
  });

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
    await expect
      .element(screen.getByRole("complementary", { name: "Resumen del inventario" }))
      .toBeVisible();
    await expect.element(screen.getByText("4 líneas", { exact: true })).toBeVisible();
    expect(rowsOf(screen)).toEqual([
      ["Productos distintos", "3"],
      ["Con vencimiento", "3"],
      ["Sin vencimiento", "1"],
    ]);
    await expectNoAccessibilityViolations(screen.container);
  });

  it("writes how many distinct products were counted as a number of the register's language", async () => {
    const { screen } = await renderPanel({
      status: "loaded",
      refreshing: false,
      value: Array.from({ length: 1200 }, (_, index) => line(`m${index}`, `p${index}`, null)),
    });

    await expect.element(screen.getByText("1.200", { exact: true }).first()).toBeVisible();
  });

  it("draws the number of lines as the panel's largest figure", async () => {
    const { screen } = await renderPanel({ status: "loaded", refreshing: false, value: [] });

    const figure = getComputedStyle(screen.getByText("0 líneas", { exact: true }).element());
    const row = getComputedStyle(screen.getByText("Con vencimiento", { exact: true }).element());
    expect(Number.parseFloat(figure.fontSize)).toBeGreaterThanOrEqual(48);
    expect(Number.parseFloat(row.fontSize)).toBeLessThan(20);
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
