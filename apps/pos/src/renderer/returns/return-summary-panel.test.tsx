import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { ReturnSummaryPanelProps } from "./return-summary-panel";
import { ReturnSummaryPanel } from "./return-summary-panel";
import { SALE } from "./test-support/sale-for-return";

function renderPanel(props: Partial<ReturnSummaryPanelProps> = {}) {
  return render(
    <ReturnSummaryPanel
      sale={SALE}
      total={1_167_500}
      totalFailed={undefined}
      linesCount={2}
      paymentRows={[{ label: "Efectivo · en el acto", value: "$ 11.675,00" }]}
      notice={undefined}
      authorizedBy={undefined}
      verification={undefined}
      canComplete
      submitting={false}
      onComplete={() => {}}
      {...props}
    />,
  );
}

function textOf(screen: Awaited<ReturnType<typeof renderPanel>>) {
  return screen.getByRole("complementary", { name: "Resumen de la devolución" }).element()
    .textContent;
}

describe("ReturnSummaryPanel", () => {
  it("shows what it refunds, the sale's invoice and date, how many lines and each payment's refund", async () => {
    const screen = await renderPanel();

    await expect.poll(() => textOf(screen)).toMatch(/A REINTEGRAR\s*\$\s*11\.675,00/);
    await expect.element(screen.getByText("Factura C")).toBeVisible();
    await expect.element(screen.getByText("00003-00001192")).toBeVisible();
    await expect.element(screen.getByText("12/09 11:42")).toBeVisible();
    await expect.element(screen.getByText("Líneas a devolver")).toBeVisible();
    await expect.element(screen.getByText("2", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Efectivo · en el acto")).toBeVisible();
  });

  it("shows the sale's date first when the sale has no invoice", async () => {
    const screen = await renderPanel({ sale: { ...SALE, invoice: null } });

    await expect.element(screen.getByText("Factura C")).not.toBeInTheDocument();
    await expect.element(screen.getByText("12/09 11:42")).toBeVisible();
  });

  it("shows what it refunds loading while it has no total", async () => {
    const screen = await renderPanel({ total: undefined });

    await expect.poll(() => textOf(screen)).toMatch(/^A REINTEGRAR\s*Esc/);
    expect(screen.container.querySelector("[aria-busy='true']")).not.toBeNull();
  });

  it("offers to calculate the refund again when it could not", async () => {
    const retry = vi.fn();
    const screen = await renderPanel({ totalFailed: { retry } });

    await expect.element(screen.getByText("No se pudo calcular el reintegro")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(retry).toHaveBeenCalledOnce();
  });

  it("shows Ticket verificado with T only when the ticket must be verified, and reports a click", async () => {
    const onChange = vi.fn();
    const screen = await renderPanel({ verification: { checked: false, onChange } });

    const card = screen.getByRole("checkbox", { name: "Ticket verificado" });
    await expect.element(card).not.toBeChecked();
    await card.click({ force: true });

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("shows no Ticket verificado when the ticket need not be verified", async () => {
    const screen = await renderPanel();

    await expect
      .element(screen.getByRole("checkbox", { name: "Ticket verificado" }))
      .not.toBeInTheDocument();
  });

  it("shows who authorized and the notice it is given", async () => {
    const screen = await renderPanel({
      authorizedBy: "Grace",
      notice: "Esa venta ya no se puede devolver.",
    });

    await expect.element(screen.getByText("Autorizó Grace").first()).toBeVisible();
    await expect
      .element(screen.getByText("Esa venta ya no se puede devolver.").first())
      .toBeVisible();
  });

  it("completes with Completar devolución while it can, and not while it cannot", async () => {
    const onComplete = vi.fn();
    const screen = await renderPanel({ onComplete });

    await userEvent.click(screen.getByRole("button", { name: "Completar devolución" }));
    expect(onComplete).toHaveBeenCalledOnce();

    await screen.rerender(
      <ReturnSummaryPanel
        sale={SALE}
        total={0}
        totalFailed={undefined}
        linesCount={0}
        paymentRows={[]}
        notice={undefined}
        authorizedBy={undefined}
        verification={undefined}
        canComplete={false}
        submitting={false}
        onComplete={onComplete}
      />,
    );
    await expect
      .element(screen.getByRole("button", { name: "Completar devolución" }))
      .toBeDisabled();
  });
});
