import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  appartadosCard,
  BOTH_CONFIGURER,
  CONFIGURED,
  DEVICES_CONFIGURER,
  NO_CONFIGURER,
  PRINTER_CONFIGURER,
  panelOf,
  renderSettings,
} from "./test-support/settings-screen";

describe("SettingsScreen", () => {
  it("offers Inicio and no cash entries, with Ajustes current, when no session is open", async () => {
    const { screen } = await renderSettings({ section: "printer" });

    await expect.element(screen.getByRole("link", { name: "Inicio" })).toBeVisible();
    await expect.element(screen.getByRole("link", { name: "Caja" })).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("link", { name: "Ajustes" }))
      .toHaveAttribute("aria-current", "page");
  });

  it("offers the open-session menu, with Ajustes current, while a session is open", async () => {
    const { screen } = await renderSettings({ section: "printer", sessionOpen: true });

    await expect.element(screen.getByRole("link", { name: "Venta" })).toBeVisible();
    await expect.element(screen.getByRole("link", { name: "Caja" })).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Ajustes" }))
      .toHaveAttribute("aria-current", "page");
    await expect.element(screen.getByRole("link", { name: "Inicio" })).not.toBeInTheDocument();
  });

  it("is headed Configuración, leaving the register's name to the frame's header", async () => {
    const { screen } = await renderSettings({ section: "printer" });

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Configuración" }))
      .toBeVisible();
    await expect.element(screen.getByRole("region", { name: "Estado de la caja" })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("lists Impresora and Balanza y lector under APARTADOS to a person who may configure both", async () => {
    const { screen } = await renderSettings({ section: "printer" });

    const card = appartadosCard(screen);
    await expect.element(card.getByRole("button", { name: /^Impresora/ })).toBeVisible();
    await expect.element(card.getByRole("button", { name: /^Balanza y lector/ })).toBeVisible();
  });

  it("lists only the printer to a person who may configure only it", async () => {
    const { screen } = await renderSettings({ person: PRINTER_CONFIGURER });

    const card = appartadosCard(screen);
    await expect.element(card.getByRole("button", { name: /^Impresora/ })).toBeVisible();
    await expect
      .element(card.getByRole("button", { name: /^Balanza y lector/ }))
      .not.toBeInTheDocument();
  });

  it("opens on the first shown section when none is asked for", async () => {
    const { screen } = await renderSettings({ person: DEVICES_CONFIGURER });

    await expect.element(panelOf(screen, "Balanza y lector")).toBeVisible();
  });

  it("opens on the first shown section when the one asked for is not shown", async () => {
    const { screen } = await renderSettings({ person: PRINTER_CONFIGURER, section: "devices" });

    await expect.element(panelOf(screen, "Impresora de tickets")).toBeVisible();
  });

  it("shows no section and no panel to a person who may configure nothing", async () => {
    const { screen } = await renderSettings({ person: NO_CONFIGURER });

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Configuración" }))
      .toBeVisible();
    await expect.element(appartadosCard(screen).getByRole("button")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("complementary")).not.toBeInTheDocument();
  });

  it("marks the shown section as the selected row", async () => {
    const { screen } = await renderSettings({ section: "devices" });

    const card = appartadosCard(screen);
    await expect
      .element(card.getByRole("button", { name: /^Balanza y lector/ }))
      .toHaveAttribute("aria-current", "true");
    await expect
      .element(card.getByRole("button", { name: /^Impresora/ }))
      .not.toHaveAttribute("aria-current");
  });

  it("selects a section when its row is pressed", async () => {
    const { screen, onSelectSection } = await renderSettings({ section: "printer" });

    await userEvent.click(
      appartadosCard(screen).getByRole("button", { name: /^Balanza y lector/ }),
    );

    expect(onSelectSection).toHaveBeenCalledExactlyOnceWith("devices");
  });

  it("moves to the next section on ArrowDown and the previous on ArrowUp, and no further than the ends", async () => {
    const first = await renderSettings({ section: "printer" });
    await userEvent.keyboard("{ArrowUp}");
    expect(first.onSelectSection).not.toHaveBeenCalled();
    await userEvent.keyboard("{ArrowDown}");
    expect(first.onSelectSection).toHaveBeenCalledExactlyOnceWith("devices");
    await first.screen.unmount();

    const last = await renderSettings({ section: "devices" });
    await userEvent.keyboard("{ArrowDown}");
    expect(last.onSelectSection).not.toHaveBeenCalled();
    await userEvent.keyboard("{ArrowUp}");
    expect(last.onSelectSection).toHaveBeenCalledExactlyOnceWith("printer");
  });

  it("shows the printer's address in its row, and Sin configurar when it has none", async () => {
    const configured = await renderSettings({
      section: "devices",
      readPrinter: async () => CONFIGURED,
    });
    await expect
      .element(appartadosCard(configured.screen).getByText("10.10.10.2:9100"))
      .toBeVisible();
    await configured.screen.unmount();

    const { screen } = await renderSettings({ section: "devices" });
    await expect.element(appartadosCard(screen).getByText("Sin configurar")).toBeVisible();
  });

  it("shows the standing of the scale and the reader in the row of Balanza y lector", async () => {
    const connected = await renderSettings({
      person: BOTH_CONFIGURER,
      section: "printer",
      standings: { scale: "matching", reader: "matching" },
    });
    const card = appartadosCard(connected.screen);
    await expect.element(card.getByText("Balanza conectada")).toBeVisible();
    await expect.element(card.getByText("Lector conectado")).toBeVisible();
    await connected.screen.unmount();

    const { screen } = await renderSettings({
      section: "printer",
      standings: { scale: "not_detected", reader: "not_detected" },
    });
    await expect.element(appartadosCard(screen).getByText("Balanza sin conectar")).toBeVisible();
    await expect.element(appartadosCard(screen).getByText("Lector sin conectar")).toBeVisible();
  });

  it("shows Esc at the top right of the panel, and leaves for Inicio when it is pressed", async () => {
    const { screen } = await renderSettings({ section: "printer" });

    await userEvent.click(
      panelOf(screen, "Impresora de tickets").getByRole("button", { name: "Cerrar con Esc" }),
    );

    await expect.poll(() => screen.router.state.location.pathname).toBe("/");
  });

  it("leaves for the sale when Esc is pressed in the panel while a session is open", async () => {
    const { screen } = await renderSettings({ section: "printer", sessionOpen: true });
    await screen.router.navigate({ to: "/history" });

    await userEvent.click(
      panelOf(screen, "Impresora de tickets").getByRole("button", { name: "Cerrar con Esc" }),
    );

    await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
  });

  it("offers no Ahora no when the screen was not offered after signing in", async () => {
    const { screen } = await renderSettings({ section: "devices" });

    await expect.element(screen.getByRole("button", { name: "Ahora no" })).not.toBeInTheDocument();
  });

  it("offers Ahora no beside Esc when the devices were offered after signing in, and leaves for Inicio through it", async () => {
    const { screen } = await renderSettings({ section: "devices", offered: true });
    await screen.router.navigate({ to: "/history" });

    await userEvent.click(
      panelOf(screen, "Balanza y lector").getByRole("button", { name: "Ahora no" }),
    );

    await expect.poll(() => screen.router.state.location.pathname).toBe("/");
  });

  it("leaves for Inicio on Escape when the devices were offered after signing in", async () => {
    const { screen } = await renderSettings({ section: "devices", offered: true });
    await screen.router.navigate({ to: "/history" });

    await userEvent.keyboard("{Escape}");

    await expect.poll(() => screen.router.state.location.pathname).toBe("/");
  });
});
