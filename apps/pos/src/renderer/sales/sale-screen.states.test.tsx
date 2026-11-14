import type { OpenSale, RegisterStatus, ScanProductOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { CoreData } from "../platform/use-core-query";
import { PLACEHOLDER, renderScreen, SALE_OF_FOUR_LINES, scan } from "./test-support/sale-screen";

const PAYMENT_KEYS = ["Cobrar en efectivo", "Point débito", "Point crédito", "QR"];

function legendOf() {
  return Array.from(document.querySelectorAll("main ul li"), (item) => item.textContent);
}

describe("SaleScreen with an empty sale", () => {
  it("says the sale is empty in the middle of the table, offering only F2 to search and F4 Consulta", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByText("La venta está vacía")).toBeVisible();
    expect(legendOf()).toEqual(["F2Buscar", "F4Consulta"]);
    await expect.element(screen.getByRole("columnheader")).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows a total of $ 0,00 with no articles, and the ways to charge disabled", async () => {
    const { screen } = await renderScreen();

    const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
    await expect.element(panel.getByText("$ 0,00").first()).toBeVisible();
    await expect.element(panel.getByText("Artículos")).toBeVisible();
    await expect.element(panel.getByText("0", { exact: true })).toBeVisible();
    for (const name of PAYMENT_KEYS) {
      await expect.element(screen.getByRole("button", { name })).toBeDisabled();
    }
    await expect.element(screen.getByRole("button", { name: "Otros medios" })).toBeVisible();
  });

  it("does not go to the charge screen on F12", async () => {
    const { screen } = await renderScreen();
    await expect.element(screen.getByText("La venta está vacía")).toBeVisible();

    await userEvent.keyboard("{F12}");

    expect(screen.router.state.location.pathname).not.toBe("/charge");
  });

  it("has the search field with its placeholder, in focus", async () => {
    const { field } = await renderScreen();

    await expect.element(field).toHaveFocus();
    await expect.element(field).toHaveAttribute("placeholder", PLACEHOLDER);
    expect(PLACEHOLDER).toBe("Escaneá o escribí el nombre");
  });
});

describe("SaleScreen with a code that has no product", () => {
  async function scanUnknown() {
    const scanProduct = vi.fn(async (): Promise<ScanProductOutcome> => ({ kind: "unknown_code" }));
    const rendered = await renderScreen({
      currentSale: async () => SALE_OF_FOUR_LINES,
      scanProduct,
    });
    await expect.element(rendered.screen.getByText("Pasas de uva")).toBeVisible();
    await scan(rendered.field, "7790000000123");
    return rendered;
  }

  it("marks the search field as invalid, keeping the code, and says what to do", async () => {
    const { screen, field } = await scanUnknown();

    await expect.element(field).toHaveAttribute("aria-invalid", "true");
    await expect.element(field).toHaveValue("7790000000123");
    await expect.element(screen.getByText("No hay ningún producto con ese código")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Buscalo por nombre. Si no aparece, falta darlo de alta en el backoffice.",
        ),
      )
      .toBeVisible();
  });

  it("leaves the sale as it was", async () => {
    const { screen } = await scanUnknown();

    await expect.element(screen.getByRole("row")).toHaveLength(5);
    await expect.element(screen.getByText("$ 25.192,50").first()).toBeVisible();
    expect(legendOf()).toEqual([
      "↑↓Líneas",
      "F2Buscar",
      "F3Pesar",
      "F4Consulta",
      "F6Precio",
      "F7Descuento",
      "F8Vaciar",
      "SuprQuitar",
    ]);
  });

  it("takes the red away when the text changes", async () => {
    const { field } = await scanUnknown();

    await field.fill("7790000000124");

    await expect.element(field).not.toHaveAttribute("aria-invalid", "true");
  });
});

describe("SaleScreen when the sale cannot be loaded", () => {
  async function failing() {
    const currentSale = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(SALE_OF_FOUR_LINES);
    const rendered = await renderScreen({ currentSale });
    await expect.element(rendered.screen.getByText("No se pudo cargar la venta")).toBeVisible();
    return { ...rendered, currentSale };
  }

  it("says so in the middle of the table, with R Reintentar as the only key", async () => {
    const { screen } = await failing();

    await expect.element(screen.getByText("Volvé a intentarlo en unos segundos.")).toBeVisible();
    expect(legendOf()).toEqual(["RReintentar"]);
    await expect
      .element(screen.getByRole("button", { name: "Reintentar" }))
      .not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows a total of $ 0,00 and no articles, with payment disabled", async () => {
    const { screen } = await failing();

    const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
    await expect.element(panel.getByText("$ 0,00").first()).toBeVisible();
    await expect.element(panel.getByText("Artículos")).toBeVisible();
    await expect.element(panel.getByText("0", { exact: true })).toBeVisible();
    for (const name of PAYMENT_KEYS) {
      await expect.element(screen.getByRole("button", { name })).toBeDisabled();
    }
  });

  it("reads the sale again on R, leaving the search field empty", async () => {
    const { screen, field, currentSale } = await failing();

    await userEvent.keyboard("r");

    await expect.element(screen.getByText("Pasas de uva")).toBeVisible();
    expect(currentSale).toHaveBeenCalledTimes(2);
    await expect.element(field).toHaveValue("");
  });

  it("types R into the search field instead of reading the sale again while the field holds text", async () => {
    const { field, currentSale } = await failing();
    await field.fill("ma");

    await userEvent.keyboard("r");

    await expect.element(field).toHaveValue("mar");
    expect(currentSale).toHaveBeenCalledOnce();
  });
});

describe("SaleScreen with the critical battery alert", () => {
  const CRITICAL: CoreData<RegisterStatus> = {
    status: "loaded",
    value: {
      conditions: [
        {
          kind: "sales_denied",
          reason: "battery_critical",
          level: "critical",
          since: "2026-10-29T09:30:00.000-03:00",
        },
      ],
      cloud: "reachable",
      serial_devices: { scale: "not_registered", reader: "not_registered" },
      serial_devices_setup_offered: false,
      contingency: null,
    },
    refreshing: false,
  };

  it("shows the notice and keeps the sale in progress operable and chargeable", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_FOUR_LINES as OpenSale,
      registerStatus: CRITICAL,
    });

    await expect
      .element(screen.getByText("No se pueden abrir ventas nuevas: queda poca batería"))
      .toBeVisible();
    await expect.element(screen.getByRole("row")).toHaveLength(5);
    for (const name of PAYMENT_KEYS) {
      await expect.element(screen.getByRole("button", { name })).toBeEnabled();
    }
    expect(legendOf()).toEqual([
      "↑↓Líneas",
      "F2Buscar",
      "F3Pesar",
      "F4Consulta",
      "F6Precio",
      "F7Descuento",
      "F8Vaciar",
      "SuprQuitar",
    ]);
  });

  it("draws the notice with a battery", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_FOUR_LINES as OpenSale,
      registerStatus: CRITICAL,
    });

    await expect
      .element(screen.getByText("No se pueden abrir ventas nuevas: queda poca batería"))
      .toBeVisible();
    expect(document.querySelector("main svg.lucide-battery-low")).not.toBeNull();
    expect(document.querySelector("main svg.lucide-ban")).toBeNull();
  });
});
