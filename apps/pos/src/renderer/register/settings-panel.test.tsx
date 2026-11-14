import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { Usb } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { SaveButton, SettingsPanel } from "./settings-panel";

describe("SettingsPanel", () => {
  it("is a panel named and headed by its title, with its content and its footer", async () => {
    const screen = await render(
      <SettingsPanel icon={<Usb />} title="Balanza y lector" onClose={() => {}} footer={<p>Pie</p>}>
        <p>Contenido</p>
      </SettingsPanel>,
    );

    const panel = screen.getByRole("complementary", { name: "Balanza y lector" });
    await expect.element(panel.getByRole("heading", { name: "Balanza y lector" })).toBeVisible();
    await expect.element(panel.getByText("Contenido")).toBeVisible();
    await expect.element(panel.getByText("Pie")).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("closes on its Esc button", async () => {
    const onClose = vi.fn();
    const screen = await render(
      <SettingsPanel icon={<Usb />} title="Balanza y lector" onClose={onClose}>
        <p>Contenido</p>
      </SettingsPanel>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Cerrar con Esc" }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("names its Esc button with the close label it is given", async () => {
    const screen = await render(
      <SettingsPanel
        icon={<Usb />}
        title="Balanza y lector"
        onClose={() => {}}
        closeLabel="Ahora no"
      >
        <p>Contenido</p>
      </SettingsPanel>,
    );

    await expect.element(screen.getByRole("button", { name: "Ahora no" })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Cerrar con Esc" }))
      .not.toBeInTheDocument();
  });
});

describe("SaveButton", () => {
  it("is Guardar with Enter, and saves when pressed", async () => {
    const onPress = vi.fn();
    const screen = await render(<SaveButton onPress={onPress} />);

    const button = screen.getByRole("button", { name: "Guardar" });
    expect(button.element().querySelector("kbd")?.textContent).toBe("Enter");
    await userEvent.click(button);

    expect(onPress).toHaveBeenCalledOnce();
  });

  it("is disabled when it may not save", async () => {
    const screen = await render(<SaveButton onPress={() => {}} disabled />);

    await expect.element(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("is disabled while the save is out", async () => {
    const screen = await render(<SaveButton onPress={() => {}} submitting />);

    await expect.element(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });
});
