import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { KeyLayerProvider } from "../platform/key-layer";
import { draftLineOf } from "./return-form";
import type { ReturnLinePanelProps } from "./return-line-panel";
import { ReturnLinePanel } from "./return-line-panel";
import { HONEY, NIBS, PASTA, SALE } from "./test-support/sale-for-return";

function renderPanel(props: Partial<ReturnLinePanelProps> = {}) {
  const line = props.line ?? NIBS;
  return render(
    <KeyLayerProvider>
      <ReturnLinePanel
        sale={SALE}
        line={line}
        draft={draftLineOf(line)}
        refund={423_500}
        onApply={() => {}}
        onCancel={() => {}}
        {...props}
      />
    </KeyLayerProvider>,
  );
}

describe("ReturnLinePanel", () => {
  it("shows the line's name, its refund, Esc and what was sold", async () => {
    const screen = await renderPanel();

    await expect.element(screen.getByText("NIBS DE CACAO")).toBeVisible();
    await expect.element(screen.getByText("$ 4.235,00")).toBeVisible();
    await expect.element(screen.getByText("Esc", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("0,350 kg")).toBeVisible();
  });

  it("shows the refund loading while the core has not answered for the line", async () => {
    const screen = await renderPanel({ refund: undefined });

    expect(screen.container.querySelector("[aria-busy='true']")).not.toBeNull();
  });

  it("opens with Cantidad focused and the drafted options chosen", async () => {
    const screen = await renderPanel({
      draft: {
        quantity: "0,200",
        reason: "defective",
        disposition: "discard",
        resolution: "exchange",
      },
    });

    await expect.element(screen.getByRole("textbox", { name: "Cantidad" })).toHaveFocus();
    await expect.element(screen.getByRole("textbox", { name: "Cantidad" })).toHaveValue("0,200");
    await expect.element(screen.getByRole("radio", { name: "Defecto" })).toBeChecked();
    await expect.element(screen.getByRole("radio", { name: "Cambio" })).toBeChecked();
    await expect.element(screen.getByRole("radio", { name: "Descarte" })).toBeChecked();
  });

  it("applies what was edited on Enter", async () => {
    const onApply = vi.fn();
    const screen = await renderPanel({ onApply });

    await userEvent.fill(screen.getByRole("textbox", { name: "Cantidad" }), "0,200");
    await screen.getByRole("radio", { name: "Defecto" }).click({ force: true });
    await screen.getByRole("radio", { name: "Cambio" }).click({ force: true });
    await screen.getByRole("radio", { name: "Descarte" }).click({ force: true });
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() =>
      expect(onApply).toHaveBeenCalledWith({
        quantity: "0,200",
        reason: "defective",
        disposition: "discard",
        resolution: "exchange",
      }),
    );
  });

  it("applies it with the Aplicar button too", async () => {
    const onApply = vi.fn();
    const screen = await renderPanel({ line: PASTA, onApply });

    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    await vi.waitFor(() =>
      expect(onApply).toHaveBeenCalledWith({
        quantity: "3",
        reason: "change_of_mind",
        disposition: "restock",
        resolution: "refund",
      }),
    );
  });

  it("cancels on Esc without applying", async () => {
    const onApply = vi.fn();
    const onCancel = vi.fn();
    await renderPanel({ onApply, onCancel });

    await userEvent.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("goes back to the first resolution the sale offers when the new reason does not offer the chosen one", async () => {
    const onApply = vi.fn();
    const screen = await renderPanel({
      onApply,
      draft: { ...draftLineOf(NIBS), reason: "defective", resolution: "exchange" },
    });

    await screen.getByRole("radio", { name: "Arrepentimiento" }).click({ force: true });

    await expect.element(screen.getByRole("radio", { name: "Cambio" })).not.toBeInTheDocument();
    await expect.element(screen.getByRole("radio", { name: "Reintegro" })).toBeChecked();
  });

  it("marks Vencido the reason whose return window is over", async () => {
    const screen = await renderPanel({
      sale: {
        ...SALE,
        windows: { ...SALE.windows, defective: { ...SALE.windows.defective, open: false } },
      },
    });

    await expect
      .element(screen.getByRole("radio", { name: "Defecto, Vencido", exact: true }))
      .toBeInTheDocument();
    await expect
      .element(screen.getByRole("radio", { name: "Arrepentimiento", exact: true }))
      .toBeChecked();
  });

  it("locks the quantity of a line that goes back whole for its reason, at all that remains", async () => {
    const screen = await renderPanel({ line: HONEY });

    await expect.element(screen.getByRole("textbox", { name: "Cantidad" })).toHaveValue("2");
    await expect
      .element(screen.getByRole("textbox", { name: "Cantidad" }))
      .toHaveAttribute("readonly");
  });
});
