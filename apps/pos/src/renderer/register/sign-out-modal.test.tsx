import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { SignOutModal } from "./sign-out-modal";

// Wider than the default phone-sized browser-mode viewport, which clips the modal.
async function renderModal(open = true) {
  await page.viewport(1280, 900);
  onTestFinished(() => page.viewport(414, 896));
  const onClose = vi.fn();
  const onSignOut = vi.fn();
  const screen = await render(
    <SignOutModal open={open} firstName="Ada" onClose={onClose} onSignOut={onSignOut} />,
  );
  return { screen, onClose, onSignOut };
}

describe("SignOutModal", () => {
  it("asks whether to leave the register, naming who is in", async () => {
    const { screen } = await renderModal();

    const dialog = screen.getByRole("dialog", { name: "¿Salir de la caja?" });

    await expect.element(dialog).toBeVisible();
    await expect.element(dialog.getByText("Ada")).toBeVisible();
    await expectNoAccessibilityViolations(document.body);
  });

  it("is not shown while closed", async () => {
    const { screen } = await renderModal(false);

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  });

  it("signs out when Salir is confirmed", async () => {
    const { screen, onSignOut, onClose } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Salir" }));

    expect(onSignOut).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes without signing out on Cancelar", async () => {
    const { screen, onSignOut, onClose } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onSignOut).not.toHaveBeenCalled();
  });

  it("closes without signing out on Escape", async () => {
    const { onSignOut, onClose } = await renderModal();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
    expect(onSignOut).not.toHaveBeenCalled();
  });

  it("closes without signing out from its close button", async () => {
    const { screen, onSignOut, onClose } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onSignOut).not.toHaveBeenCalled();
  });
});
