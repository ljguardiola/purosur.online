import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { InitialCountUnavailablePanel } from "./initial-count-unavailable-panel";

async function renderPanel() {
  await page.viewport(1280, 720);
  const onGoHome = vi.fn();
  const screen = await render(
    <div style={{ height: 600, display: "flex", justifyContent: "flex-end" }}>
      <InitialCountUnavailablePanel onGoHome={onGoHome} />
    </div>,
  );
  return { screen, onGoHome };
}

describe("InitialCountUnavailablePanel", () => {
  it("titles the panel Inventario inicial and leaves it empty", async () => {
    const { screen } = await renderPanel();

    await expect
      .element(screen.getByRole("heading", { level: 2, name: "Inventario inicial" }))
      .toBeVisible();
    await expect.element(screen.getByText("Cargado hasta ahora")).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("goes home from the Esc keycap at the top right", async () => {
    const { screen, onGoHome } = await renderPanel();

    const close = screen.getByRole("button", { name: "Cerrar con Esc" });
    expect(close.element().querySelector("kbd")?.textContent).toBe("Esc");
    await userEvent.click(close);

    expect(onGoHome).toHaveBeenCalledOnce();
  });

  it("goes home from the button, which shows the arrow before its text and the Enter keycap", async () => {
    const { screen, onGoHome } = await renderPanel();

    const back = screen.getByRole("button", { name: "Volver al inicio" });
    expect(back.element().querySelector("kbd")?.textContent).toBe("Enter");
    expect(back.element().querySelector("svg")).not.toBeNull();
    await userEvent.click(back);

    expect(onGoHome).toHaveBeenCalledOnce();
  });
});
