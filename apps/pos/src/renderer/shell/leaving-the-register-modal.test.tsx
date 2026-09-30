import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { LeavingTheRegisterModal } from "./leaving-the-register-modal";

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
  const onLock = vi.fn();
  const onCloseRegister = vi.fn();
  const screen = await render(
    <LeavingTheRegisterModal
      open={open}
      registerName={registerName}
      onClose={onClose}
      onLock={onLock}
      onCloseRegister={onCloseRegister}
    />,
  );
  return { screen, onClose, onLock, onCloseRegister };
}

describe("LeavingTheRegisterModal", () => {
  it("asks whether to close the register or leave it locked, naming the register", async () => {
    const { screen } = await renderModal();

    const dialog = screen.getByRole("dialog", { name: "¿Cerrar la caja o dejarla bloqueada?" });

    await expect.element(dialog).toBeVisible();
    await expect.element(dialog.getByText("Caja 1 · Sesión abierta")).toBeVisible();
    await expect.element(dialog.getByRole("button", { name: "Dejar bloqueada" })).toBeVisible();
    await expect.element(dialog.getByRole("button", { name: "Cerrar caja" })).toBeVisible();
    await expect.element(dialog.getByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
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
    const { screen, onCloseRegister, onLock, onClose } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));

    expect(onCloseRegister).toHaveBeenCalledOnce();
    expect(onLock).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("leaves the register locked when Dejar bloqueada is pressed", async () => {
    const { screen, onCloseRegister, onLock, onClose } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Dejar bloqueada" }));

    expect(onLock).toHaveBeenCalledOnce();
    expect(onCloseRegister).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each([
    ["Escape", () => userEvent.keyboard("{Escape}")],
    [
      "its close button",
      () => userEvent.click(page.getByRole("button", { name: "Cerrar", exact: true })),
    ],
  ])("closes without doing either on %s", async (_way, dismiss) => {
    const { onCloseRegister, onLock, onClose } = await renderModal();

    await dismiss();

    expect(onClose).toHaveBeenCalledOnce();
    expect(onLock).not.toHaveBeenCalled();
    expect(onCloseRegister).not.toHaveBeenCalled();
  });
});
