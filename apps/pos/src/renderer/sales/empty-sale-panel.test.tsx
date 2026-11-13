import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { EmptySalePanel } from "./empty-sale-panel";

async function renderPanel({ busy = false }: { busy?: boolean } = {}) {
  const onClose = vi.fn();
  const onEmpty = vi.fn();
  const screen = await render(
    <EmptySalePanel
      lineCount={4}
      total={2_519_250}
      busy={busy}
      onClose={onClose}
      onEmpty={onEmpty}
    />,
  );
  return { screen, onClose, onEmpty };
}

describe("EmptySalePanel", () => {
  it("shows the total of the sale and how many lines it has", async () => {
    const { screen } = await renderPanel();

    await expect.element(screen.getByRole("heading", { name: "Vaciar venta" })).toBeVisible();
    await expect.element(screen.getByText("TOTAL", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 25.192,50")).toBeVisible();
    await expect.element(screen.getByText("Artículos", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("4", { exact: true })).toBeVisible();
    await expectNoAccessibilityViolations(document.body);
  });

  it("shows Esc at the top right and Enter on the destructive action, and no function key", async () => {
    const { screen } = await renderPanel();

    const keys = [...screen.container.querySelectorAll("kbd")].map((key) => key.textContent);
    expect(keys).toEqual(["Esc", "Enter"]);
    await expect.element(screen.getByRole("button", { name: "Vaciar venta" })).toBeVisible();
  });

  it("empties the sale from the button", async () => {
    const { screen, onEmpty } = await renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Vaciar venta" }));

    expect(onEmpty).toHaveBeenCalledOnce();
  });

  it("empties the sale on Enter", async () => {
    const { onEmpty } = await renderPanel();

    await userEvent.keyboard("{Enter}");

    expect(onEmpty).toHaveBeenCalledOnce();
  });

  it("closes from Esc without emptying the sale", async () => {
    const { onClose, onEmpty } = await renderPanel();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
    expect(onEmpty).not.toHaveBeenCalled();
  });

  it("closes from the Esc button", async () => {
    const { screen, onClose } = await renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Cerrar con Esc" }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does nothing while the core is answering", async () => {
    const { screen, onClose, onEmpty } = await renderPanel({ busy: true });

    await expect.element(screen.getByRole("button", { name: "Vaciar venta" })).toBeDisabled();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Escape}");

    expect(onEmpty).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
