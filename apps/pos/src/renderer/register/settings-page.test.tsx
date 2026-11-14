import type { SectionListItem } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { Printer, Usb } from "lucide-react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { KeyBinding } from "../platform/key-layer";
import { RegisterStatusProvider } from "../shell/register-status-context";
import { render } from "../shell/test-support/render-with-router";
import type { SettingsChrome } from "./settings-page";
import { SettingsPage } from "./settings-page";
import { BOTH_CONFIGURER, legendOf } from "./test-support/settings-screen";

const ITEMS: readonly SectionListItem[] = [
  { id: "printer", icon: <Printer />, title: "Impresora", statuses: [] },
  { id: "devices", icon: <Usb />, title: "Balanza y lector", statuses: [] },
];

function chromeWith(changes: Partial<SettingsChrome> = {}): SettingsChrome {
  return {
    person: BOTH_CONFIGURER,
    sessionOpen: false,
    signOut: () => {},
    items: ITEMS,
    selected: "printer",
    onSelect: () => {},
    moveSection: () => {},
    ...changes,
  };
}

async function renderPage({
  chrome = chromeWith(),
  bindings = [],
  ...props
}: Partial<Parameters<typeof SettingsPage>[0]> = {}) {
  await page.viewport(1366, 768);
  onTestFinished(() => page.viewport(414, 896));
  return render(
    <RegisterStatusProvider
      value={{
        person: BOTH_CONFIGURER,
        registerName: "Caja 1",
        cashSession: { status: "none" },
        status: { status: "loading" },
        backupTickets: { status: "loading" },
        onDiscardBackupTickets: () => {},
      }}
    >
      <SettingsPage chrome={chrome} bindings={bindings} {...props} />
    </RegisterStatusProvider>,
  );
}

describe("SettingsPage", () => {
  it("offers Inicio and no cash entries, with Ajustes current, when no session is open", async () => {
    const screen = await renderPage();

    await expect.element(screen.getByRole("link", { name: "Inicio" })).toBeVisible();
    await expect.element(screen.getByRole("link", { name: "Caja" })).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("link", { name: "Ajustes" }))
      .toHaveAttribute("aria-current", "page");
  });

  it("offers the open-session menu, with Ajustes current, while a session is open", async () => {
    const screen = await renderPage({ chrome: chromeWith({ sessionOpen: true }) });

    await expect.element(screen.getByRole("link", { name: "Venta" })).toBeVisible();
    await expect.element(screen.getByRole("link", { name: "Caja" })).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Ajustes" }))
      .toHaveAttribute("aria-current", "page");
    await expect.element(screen.getByRole("link", { name: "Inicio" })).not.toBeInTheDocument();
  });

  it("is headed Configuración, leaving the register's name to the frame's header", async () => {
    const screen = await renderPage();

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Configuración" }))
      .toBeVisible();
    await expect.element(screen.getByRole("region", { name: "Estado de la caja" })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("lists the apartados under APARTADOS with the selected one current, and chooses one when pressed", async () => {
    const onSelect = vi.fn();
    const screen = await renderPage({ chrome: chromeWith({ onSelect }) });

    const card = screen.getByRole("region", { name: "APARTADOS" });
    await expect
      .element(card.getByRole("button", { name: /^Impresora/ }))
      .toHaveAttribute("aria-current", "true");
    await userEvent.click(card.getByRole("button", { name: /^Balanza y lector/ }));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith("devices");
  });

  it("shows the keys it is given in the card's legend, and runs them", async () => {
    const run = vi.fn();
    const bindings: KeyBinding[] = [{ key: "ArrowUpDown", label: "Apartados", run }];
    const screen = await renderPage({ bindings });

    expect(legendOf(screen)).toEqual(["↑↓Apartados"]);
    await userEvent.keyboard("{ArrowDown}");

    expect(run).toHaveBeenCalledOnce();
  });

  it("shows its panel and its toasts", async () => {
    const screen = await renderPage({
      aside: <aside aria-label="Impresora de tickets" />,
      toasts: [
        {
          id: "saved",
          tone: "success",
          icon: <Printer />,
          title: "Dirección guardada",
          description: "La caja imprime en 10.10.10.2:9100 desde el próximo ticket.",
          onDismiss: () => {},
        },
      ],
    });

    await expect
      .element(screen.getByRole("complementary", { name: "Impresora de tickets" }))
      .toBeInTheDocument();
    await expect.element(screen.getByText("Dirección guardada").first()).toBeVisible();
  });
});
