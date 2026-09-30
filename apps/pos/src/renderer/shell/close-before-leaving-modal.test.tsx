import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { CloseBeforeLeavingModal } from "./close-before-leaving-modal";

// Wider than the default phone-sized browser-mode viewport, which clips the modal.
async function renderModal({
  open = true,
  registerName = "Caja 1",
}: {
  open?: boolean;
  registerName?: string | null;
} = {}) {
  await page.viewport(1280, 900);
  onTestFinished(() => page.viewport(414, 896));
  const onClose = vi.fn();
  const onCloseRegister = vi.fn();
  const screen = await render(
    <CloseBeforeLeavingModal
      open={open}
      registerName={registerName}
      onClose={onClose}
      onCloseRegister={onCloseRegister}
    />,
  );
  return { screen, onClose, onCloseRegister };
}

describe("CloseBeforeLeavingModal", () => {
  it("explains the register has to be closed first, naming the register", async () => {
    const { screen } = await renderModal();

    const dialog = screen.getByRole("dialog", { name: "Para salir, primero cerrá la caja" });

    await expect.element(dialog).toBeVisible();
    await expect.element(dialog.getByText("Caja 1 · Sesión abierta")).toBeVisible();
    await expectNoAccessibilityViolations(document.body);
  });

  it("names only the open session when the register has no name", async () => {
    const { screen } = await renderModal({ registerName: null });

    await expect.element(screen.getByText("Sesión abierta", { exact: true })).toBeVisible();
  });

  it("is not shown while closed", async () => {
    const { screen } = await renderModal({ open: false });

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  });

  it("goes to close the register when Cerrar caja is pressed", async () => {
    const { screen, onCloseRegister, onClose } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));

    expect(onCloseRegister).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes without closing the register on Cancelar", async () => {
    const { screen, onCloseRegister, onClose } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onCloseRegister).not.toHaveBeenCalled();
  });

  it("closes without closing the register on Escape", async () => {
    const { onCloseRegister, onClose } = await renderModal();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
    expect(onCloseRegister).not.toHaveBeenCalled();
  });
});
