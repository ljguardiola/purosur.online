import type { ReadReceiptPrinterOutcome, SetReceiptPrinterOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { INVALID_RECEIPT_PRINTER_ADDRESS_MESSAGE } from "./receipt-printer-form";
import type { RenderedSettings, SettingsOptions } from "./test-support/settings-screen";
import {
  CONFIGURED,
  iconBeside,
  legendOf,
  panelOf,
  renderSettings,
} from "./test-support/settings-screen";

async function renderPrinter(options: SettingsOptions = {}) {
  return renderSettings({ section: "printer", ...options });
}

function addressField(screen: RenderedSettings["screen"]) {
  return screen.getByRole("textbox", { name: "Dirección" });
}

async function type(screen: RenderedSettings["screen"], typed: string) {
  await userEvent.fill(addressField(screen), typed);
}

async function save(screen: RenderedSettings["screen"], typed: string) {
  await type(screen, typed);
  await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
}

describe("the printer's section of Ajustes", () => {
  it("is titled Impresora de tickets with Esc, and labels its only field DIRECCIÓN", async () => {
    const { screen } = await renderPrinter({ readPrinter: async () => CONFIGURED });

    const panel = panelOf(screen, "Impresora de tickets");
    await expect
      .element(panel.getByRole("heading", { name: "Impresora de tickets" }))
      .toBeVisible();
    await expect.element(panel.getByRole("button", { name: "Cerrar con Esc" })).toBeVisible();
    await expect.element(panel.getByText("DIRECCIÓN")).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("takes the focus in the address field, with no letter key at it", async () => {
    const { screen } = await renderPrinter();

    await expect.element(addressField(screen)).toHaveFocus();
    const panel = panelOf(screen, "Impresora de tickets").element();
    const keycaps = Array.from(panel.querySelectorAll("kbd")).map((key) => key.textContent);
    expect(keycaps).toEqual(["Esc", "Enter"]);
  });

  it("shows Guardar with Enter at the bottom of the panel", async () => {
    const { screen } = await renderPrinter();

    const button = panelOf(screen, "Impresora de tickets").getByRole("button", { name: "Guardar" });
    await expect.element(button).toBeVisible();
    expect(button.element().querySelector("kbd")?.textContent).toBe("Enter");
  });

  it("shows a loading placeholder while the address is read", async () => {
    const { screen } = await renderPrinter({ readPrinter: () => new Promise(() => {}) });

    await expect.element(screen.getByText("Cargando…")).toBeInTheDocument();
    await expect.element(addressField(screen)).not.toBeInTheDocument();
  });

  it("fails to load when the core cannot answer, and reads again on Reintentar", async () => {
    const readPrinter = vi
      .fn<() => Promise<ReadReceiptPrinterOutcome>>()
      .mockResolvedValueOnce({ kind: "unavailable" })
      .mockResolvedValue(CONFIGURED);
    const { screen } = await renderPrinter({ readPrinter });
    await expect
      .element(screen.getByText("No se pudo leer la dirección de la impresora"))
      .toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect.element(addressField(screen)).toHaveValue("10.10.10.2:9100");
  });

  it("warns that the printer is not configured above the field, with a placeholder, and the legend only moves between sections", async () => {
    const { screen } = await renderPrinter();

    const panel = panelOf(screen, "Impresora de tickets");
    await expect
      .element(panel.getByText("La impresora no está configurada.").first())
      .toBeVisible();
    await expect.element(addressField(screen)).toHaveValue("");
    await expect
      .element(addressField(screen))
      .toHaveAttribute("placeholder", "Dirección de la impresora");
    expect(legendOf(screen)).toEqual(["↑↓Apartados"]);
    await expectNoAccessibilityViolations(screen.container);
  });

  it.each([
    { stored: CONFIGURED, shown: "10.10.10.2:9100" },
    {
      stored: { kind: "configured", address: { host: "ticketera", port: null } } as const,
      shown: "ticketera",
    },
  ])("shows the stored address $shown without a warning", async ({ stored, shown }) => {
    const { screen } = await renderPrinter({ readPrinter: async () => stored });

    await expect.element(addressField(screen)).toHaveValue(shown);
    await expect
      .element(
        panelOf(screen, "Impresora de tickets").getByText("La impresora no está configurada."),
      )
      .not.toBeInTheDocument();
  });

  it("offers Enter to save only while the address has unsaved changes", async () => {
    const { screen } = await renderPrinter({ readPrinter: async () => CONFIGURED });
    expect(legendOf(screen)).toEqual(["↑↓Apartados"]);

    await type(screen, "10.10.10.3");

    await expect.poll(() => legendOf(screen)).toEqual(["↑↓Apartados", "EnterGuardar"]);
  });

  it("saves on Enter while the field is focused, and does nothing on Enter without changes", async () => {
    const { screen, setReceiptPrinter } = await renderPrinter({
      readPrinter: async () => CONFIGURED,
    });
    await expect.element(addressField(screen)).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(setReceiptPrinter).not.toHaveBeenCalled();

    await type(screen, "10.10.10.9:9101");
    await userEvent.keyboard("{Enter}");

    expect(setReceiptPrinter).toHaveBeenCalledExactlyOnceWith("10.10.10.9:9101");
  });

  it("sends the address as typed, tells where the register prints from the next receipt, and reads the address again", async () => {
    const { screen, setReceiptPrinter, readReceiptPrinter } = await renderPrinter();

    await save(screen, " 10.10.10.9:9101 ");

    expect(setReceiptPrinter).toHaveBeenCalledExactlyOnceWith(" 10.10.10.9:9101 ");
    await expect.element(screen.getByText("Dirección guardada")).toBeVisible();
    await expect
      .element(screen.getByText("La caja imprime en 10.10.10.9:9101 desde el próximo ticket."))
      .toBeVisible();
    await vi.waitFor(() => expect(readReceiptPrinter).toHaveBeenCalledTimes(2));
  });

  it("draws the saved toast with a check", async () => {
    const { screen } = await renderPrinter();

    await save(screen, "10.10.10.9");

    await expect.element(screen.getByText("Dirección guardada")).toBeVisible();
    expect(iconBeside(screen.getByText("Dirección guardada").element())).toContain("lucide-check");
  });

  it("offers no Enter once the address is saved", async () => {
    const { screen } = await renderPrinter();

    await save(screen, "10.10.10.9");

    await expect.element(screen.getByText("Dirección guardada")).toBeVisible();
    expect(legendOf(screen)).toEqual(["↑↓Apartados"]);
  });

  it("shows the saved address without a port as typed", async () => {
    const { screen } = await renderPrinter({
      setPrinter: async () => ({ kind: "saved", address: { host: "ticketera", port: null } }),
    });

    await save(screen, "ticketera");

    await expect
      .element(screen.getByText("La caja imprime en ticketera desde el próximo ticket."))
      .toBeVisible();
  });

  it("asks for an address when the core refuses an empty one, offering no Enter", async () => {
    const { screen, setReceiptPrinter } = await renderPrinter({
      setPrinter: async () => ({ kind: "invalid_address" }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await expect.element(screen.getByText("Escribí la dirección de la impresora.")).toBeVisible();
    expect(setReceiptPrinter).toHaveBeenCalledExactlyOnceWith("");
    expect(legendOf(screen)).toEqual(["↑↓Apartados"]);
  });

  it("explains what an address looks like when the core refuses the one sent", async () => {
    const { screen, setReceiptPrinter } = await renderPrinter({
      setPrinter: async () => ({ kind: "invalid_address" }),
    });

    await save(screen, "10.10.10.2:99999");

    await expect.element(screen.getByText(INVALID_RECEIPT_PRINTER_ADDRESS_MESSAGE)).toBeVisible();
    expect(setReceiptPrinter).toHaveBeenCalledExactlyOnceWith("10.10.10.2:99999");
  });

  it("disables the field and Guardar and says the person has no permission when the core refuses them", async () => {
    const { screen } = await renderPrinter({
      setPrinter: async () => ({ kind: "lacks_permission" }),
    });

    await save(screen, "10.10.10.9");

    const panel = panelOf(screen, "Impresora de tickets");
    await expect
      .element(panel.getByText("No tenés permiso para configurar la impresora.").first())
      .toBeVisible();
    await expect.element(addressField(screen)).toBeDisabled();
    await expect.element(panel.getByRole("button", { name: "Guardar" })).toBeDisabled();
    expect(legendOf(screen)).toEqual(["↑↓Apartados"]);
    expect(
      iconBeside(
        panel.getByText("No tenés permiso para configurar la impresora.").first().element(),
      ),
    ).toContain("lucide-triangle-alert");
  });

  it("tells the register that the session ended when the core says nobody is signed in", async () => {
    const { screen, onSessionInvalid } = await renderPrinter({
      setPrinter: async () => ({ kind: "not_signed_in" }),
    });

    await save(screen, "10.10.10.9");

    await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
  });

  it.each([
    {
      name: "the core cannot save it",
      setPrinter: async (): Promise<SetReceiptPrinterOutcome> => ({ kind: "unavailable" }),
    },
    {
      name: "the request fails",
      setPrinter: async (): Promise<SetReceiptPrinterOutcome> => {
        throw new Error("the connection was replaced");
      },
    },
  ])("asks to try again, offering no Enter, when $name", async ({ setPrinter }) => {
    const { screen } = await renderPrinter({ setPrinter });

    await save(screen, "10.10.10.9");

    await expect
      .element(
        panelOf(screen, "Impresora de tickets")
          .getByText("No se pudo guardar la dirección. Probá de nuevo.")
          .first(),
      )
      .toBeVisible();
    expect(legendOf(screen)).toEqual(["↑↓Apartados"]);
  });

  it("offers Enter again once the address is edited after a failed save", async () => {
    const { screen } = await renderPrinter({ setPrinter: async () => ({ kind: "unavailable" }) });
    await save(screen, "10.10.10.9");
    await expect
      .element(screen.getByText("No se pudo guardar la dirección. Probá de nuevo.").first())
      .toBeVisible();

    await type(screen, "10.10.10.8");

    await expect.poll(() => legendOf(screen)).toEqual(["↑↓Apartados", "EnterGuardar"]);
  });

  it("shows no address field to a person the core says may not configure the printer", async () => {
    const { screen } = await renderPrinter({
      readPrinter: async () => ({ kind: "lacks_permission" }),
    });

    await expect
      .element(screen.getByText("No tenés permiso para configurar la impresora"))
      .toBeVisible();
    await expect.element(addressField(screen)).not.toBeInTheDocument();
  });

  it("says the session ended when the core says nobody is signed in", async () => {
    const { screen } = await renderPrinter({
      readPrinter: async () => ({ kind: "not_signed_in" }),
    });

    await expect
      .element(screen.getByText("La sesión terminó. Volvé a ingresar para configurar la impresora"))
      .toBeVisible();
  });
});
