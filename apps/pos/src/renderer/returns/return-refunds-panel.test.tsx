import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { ReturnRefundsPanelProps } from "./return-refunds-panel";
import { ReturnRefundsPanel } from "./return-refunds-panel";

function renderPanel(props: Partial<ReturnRefundsPanelProps> = {}) {
  return render(
    <ReturnRefundsPanel
      total={851_000}
      rows={[
        { label: "Efectivo · en el acto", value: "$ 3.510,00" },
        { label: "Point débito · reembolso pendiente", value: "$ 5.000,00" },
      ]}
      submitting={false}
      onFinish={() => {}}
      {...props}
    />,
  );
}

describe("ReturnRefundsPanel", () => {
  it("shows the refund total as REINTEGRO and a line for each method", async () => {
    const screen = await renderPanel();

    await expect.element(screen.getByText("REINTEGRO")).toBeVisible();
    await expect.element(screen.getByText("$ 8.510,00")).toBeVisible();
    await expect.element(screen.getByText("Efectivo · en el acto")).toBeVisible();
    await expect.element(screen.getByText("$ 3.510,00")).toBeVisible();
    await expect.element(screen.getByText("Point débito · reembolso pendiente")).toBeVisible();
    await expect.element(screen.getByText("$ 5.000,00")).toBeVisible();
  });

  it("finishes with the Finalizar button", async () => {
    const onFinish = vi.fn();
    const screen = await renderPanel({ onFinish });

    await userEvent.click(screen.getByRole("button", { name: "Finalizar" }));

    expect(onFinish).toHaveBeenCalledOnce();
  });

  it("holds Finalizar while the return is being completed", async () => {
    const screen = await renderPanel({ submitting: true });

    await expect.element(screen.getByRole("button", { name: "Finalizar" })).toBeDisabled();
  });

  it("shows no lines while no method refunds anything", async () => {
    const screen = await renderPanel({ rows: [] });

    await expect.element(screen.getByText("Efectivo · en el acto")).not.toBeInTheDocument();
  });
});
