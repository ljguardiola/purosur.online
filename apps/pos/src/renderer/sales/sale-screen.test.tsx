import type { OpenSale, ScanProductOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { SaleScreenProps } from "./sale-screen";
import { salesKeys } from "./sales-queries";
import {
  ALFAJOR,
  deferred,
  NOT_PERMITTED_HELP,
  NOT_PERMITTED_TITLE,
  PLACEHOLDER,
  renderScreen,
  SALE_OF_YERBA,
  SALE_OF_YERBA_AND_ALFAJOR,
  scan,
  YERBA,
} from "./test-support/sale-screen";

describe("SaleScreen", () => {
  it("says that the sale is underway", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByRole("heading", { name: "Venta en curso" })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("names the register and when the session opened in the eyebrow", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByText("Caja 1 · Sesión abierta 09:02")).toBeVisible();
  });

  it("leaves the register's name out of the eyebrow while it isn't known", async () => {
    const { screen } = await renderScreen({ registerName: null });

    await expect.element(screen.getByText("Sesión abierta 09:02", { exact: true })).toBeVisible();
  });

  it("offers Venta, Caja and the first name of the person who opened, and a way out", async () => {
    const { screen } = await renderScreen();

    const rail = screen.getByRole("navigation", { name: "Menú de la caja" }).element();

    const items = Array.from(rail.querySelectorAll("button, a")).map((item) => item.textContent);
    expect(items).toEqual(["Venta", "Caja", "Salir"]);
    await expect.element(screen.getByText("Ada")).toBeVisible();
    expect(screen.container.textContent).not.toContain("sell_and_charge");
  });

  it("marks Venta as the current screen", async () => {
    const { screen } = await renderScreen();

    await expect
      .element(screen.getByRole("button", { name: "Venta" }))
      .toHaveAttribute("aria-current", "page");
    await expect
      .element(screen.getByRole("link", { name: "Caja" }))
      .not.toHaveAttribute("aria-current");
  });

  it("goes to the cash screen when Caja is pressed", async () => {
    const { screen } = await renderScreen();

    await userEvent.click(screen.getByRole("link", { name: "Caja" }));

    expect(screen.router.state.location.pathname).toBe("/cash");
  });

  it("has the scan field focused and named as the place to scan a product", async () => {
    const { screen, field } = await renderScreen();

    await expect.element(field).toHaveFocus();
    await expect.element(field).toHaveAttribute("placeholder", PLACEHOLDER);
    await expect.element(screen.getByRole("combobox")).toBeVisible();
  });

  it("keeps a scanned line when an older read of the sale answers after the scan", async () => {
    const read = deferred<OpenSale | null>();
    const { screen, field } = await renderScreen({
      currentSale: () => read.promise,
      scanProduct: async () => ({ kind: "added", sale: SALE_OF_YERBA }),
    });

    await scan(field, "7790001");
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
    read.resolve(null);
    await expect.poll(() => screen.queryClient.isFetching()).toBe(0);

    expect(screen.queryClient.getQueryData(salesKeys.currentSale("s1", "u1"))).toEqual(
      SALE_OF_YERBA,
    );
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
    await expect.element(screen.getByText("1 línea")).toBeVisible();
  });

  describe("keeping the scan field ready", () => {
    it.each([
      [
        "the heading",
        (screen: Awaited<ReturnType<typeof renderScreen>>["screen"]) =>
          screen.getByRole("heading", { name: "Venta en curso" }),
      ],
      [
        "the lines",
        (screen: Awaited<ReturnType<typeof renderScreen>>["screen"]) =>
          screen.getByText("Yerba mate 1 kg"),
      ],
      [
        "the amount to charge",
        (screen: Awaited<ReturnType<typeof renderScreen>>["screen"]) => screen.getByText("1 línea"),
      ],
    ])("takes a scan typed after clicking %s", async (_place, target) => {
      const scanProduct = vi.fn(
        async (): Promise<ScanProductOutcome> => ({ kind: "added", sale: SALE_OF_YERBA }),
      );
      const { screen, field } = await renderScreen({
        currentSale: async () => SALE_OF_YERBA,
        scanProduct,
      });
      await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();

      await target(screen).click();
      await expect.element(field).toHaveFocus();
      await userEvent.keyboard("7790001{Enter}");

      await expect.poll(() => scanProduct.mock.calls).toEqual([["7790001"]]);
    });

    it("leaves the focus on a button the person pressed", async () => {
      const { screen } = await renderScreen({
        currentSale: async () => {
          throw new Error("unavailable");
        },
      });

      const retry = screen.getByRole("button", { name: "Reintentar" });
      await expect.element(retry).toBeVisible();
      await retry.element().focus();

      await expect.element(retry).toHaveFocus();
    });

    it("has the field ready again once the retry replaces the button that had the focus", async () => {
      const currentSale = vi
        .fn<SaleScreenProps["currentSale"]>()
        .mockRejectedValueOnce(new Error("unavailable"))
        .mockResolvedValueOnce(SALE_OF_YERBA);
      const { screen, field } = await renderScreen({ currentSale });

      await screen.getByRole("button", { name: "Reintentar" }).click();

      await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
      await expect.element(field).toHaveFocus();
    });
  });

  describe("reading the sale in progress", () => {
    it("asks for the sale of the person who is selling", async () => {
      const currentSale = vi.fn(async () => null);

      await renderScreen({ currentSale });

      await expect.poll(() => currentSale.mock.calls).toEqual([[]]);
    });

    it("shows a placeholder while it loads, with the scan field ready", async () => {
      const { screen, field } = await renderScreen({ currentSale: () => new Promise(() => {}) });

      await expect.element(screen.getByText("Cargando…")).toBeInTheDocument();
      await expect.element(field).toHaveFocus();
    });

    it("shows an empty sale as empty, with nothing to charge", async () => {
      const { screen } = await renderScreen();

      await expect.element(screen.getByText("La venta está vacía")).toBeVisible();
      await expect.element(screen.getByText("Escaneá un producto para agregarlo.")).toBeVisible();
      const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
      await expect.element(panel.getByText("Total a cobrar")).toBeVisible();
      await expect.element(panel.getByText("$ 0,00").first()).toBeVisible();
      await expect.element(panel.getByText("0 líneas")).toBeVisible();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("tells that the person may not sell instead of showing the sale as empty", async () => {
      const { screen } = await renderScreen({ currentSale: async () => "not_permitted" });

      await expect.element(screen.getByText(NOT_PERMITTED_TITLE)).toBeVisible();
      await expect.element(screen.getByText(NOT_PERMITTED_HELP)).toBeVisible();
      await expect.element(screen.getByText("La venta está vacía")).not.toBeInTheDocument();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("shows the lines of the sale with their quantity and amount, and the total to charge", async () => {
      const { screen } = await renderScreen({
        currentSale: async () => SALE_OF_YERBA_AND_ALFAJOR,
      });

      const lines = screen.getByRole("list").getByRole("listitem");
      await expect.element(lines).toHaveLength(2);
      const yerba = lines.first();
      await expect.element(yerba.getByText("Yerba mate 1 kg")).toBeVisible();
      await expect.element(yerba.getByText("2", { exact: true })).toBeVisible();
      await expect.element(yerba.getByText("$ 4.760,00")).toBeVisible();
      const alfajor = lines.last();
      await expect.element(alfajor.getByText("Alfajor triple")).toBeVisible();
      await expect.element(alfajor.getByText("$ 1.500,00")).toBeVisible();
      const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
      await expect.element(panel.getByText("$ 6.260,00").first()).toBeVisible();
      await expect.element(panel.getByText("2 líneas")).toBeVisible();
      await expect.element(screen.getByText("La venta está vacía")).not.toBeInTheDocument();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("shows under the name the promotion a line was charged with, and the amount it had without it", async () => {
      const promoted = {
        ...YERBA,
        discount_amount: 47_600,
        promotion: { kind: "PERCENT_OFF", percent: 10 } as const,
        line_total: 428_400,
      };
      const { screen } = await renderScreen({
        currentSale: async () => ({
          id: "sale-1",
          lines: [promoted, ALFAJOR],
          total: 578_400,
          charge_refusal: null,
        }),
      });

      const lines = screen.getByRole("list").getByRole("listitem");
      const yerba = lines.first();
      await expect.element(yerba.getByText("10 % de descuento")).toBeVisible();
      const withoutPromotion = yerba.getByText("$ 4.760,00");
      await expect.element(withoutPromotion).toBeVisible();
      expect(withoutPromotion.element().tagName).toBe("S");
      await expect.element(yerba.getByText("$ 4.284,00")).toBeVisible();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("writes a buy N pay M promotion as a purchase and a payment quantity", async () => {
      const promoted = {
        ...ALFAJOR,
        quantity: 3,
        discount_amount: 150_000,
        promotion: { kind: "BUY_N_PAY_M", buy_qty: 3, pay_qty: 2 } as const,
        line_total: 300_000,
      };
      const { screen } = await renderScreen({
        currentSale: async () => ({
          id: "sale-1",
          lines: [promoted],
          total: 300_000,
          charge_refusal: null,
        }),
      });

      await expect.element(screen.getByText("Lleve 3, pague 2")).toBeVisible();
      await expect.element(screen.getByText("$ 4.500,00")).toBeVisible();
    });

    it("shows nothing more than the name and the amount on a line without a promotion", async () => {
      const { screen } = await renderScreen({ currentSale: async () => SALE_OF_YERBA });

      const yerba = screen.getByRole("list").getByRole("listitem").first();
      await expect.element(yerba.getByText("$ 4.760,00")).toBeVisible();
      expect(yerba.element().querySelector("s")).toBeNull();
      expect(yerba.element().textContent).toBe("Yerba mate 1 kg2$ 4.760,00");
    });

    it("writes 1 línea in the singular", async () => {
      const { screen } = await renderScreen({ currentSale: async () => SALE_OF_YERBA });

      await expect
        .element(screen.getByRole("complementary", { name: "Panel de cobro" }).getByText("1 línea"))
        .toBeVisible();
    });

    it("keeps Cobrar disabled while the sale has no lines", async () => {
      const { screen } = await renderScreen();

      await expect.element(screen.getByText("La venta está vacía")).toBeVisible();
      await expect.element(screen.getByRole("button", { name: "Cobrar" })).toBeDisabled();
    });

    it("keeps Cobrar disabled, and says why, while the sale's total is zero", async () => {
      const { screen } = await renderScreen({
        currentSale: async () => ({
          id: "sale-1",
          lines: [{ ...YERBA, discount_amount: 476_000, line_total: 0 }],
          total: 0,
          charge_refusal: null,
        }),
      });

      await expect
        .element(
          screen.getByText("El total es $ 0,00: quitá el producto o cancelá la venta.").first(),
        )
        .toBeVisible();
      await expect.element(screen.getByRole("button", { name: "Cobrar" })).toBeDisabled();
    });

    it("replaces Cobrar by a disabled Cobro no habilitado, and says the total reached the threshold", async () => {
      const { screen } = await renderScreen({
        currentSale: async () => ({
          ...SALE_OF_YERBA,
          charge_refusal: { kind: "reaches_buyer_identification_threshold", threshold: 476_000 },
        }),
      });

      const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
      await expect.element(panel.getByText("Llegaste al tope de venta")).toBeVisible();
      await expect
        .element(
          panel.getByText(
            "El total no puede ser igual o mayor a $ 4.760,00. Quitá productos o bajá cantidades para poder cobrar.",
          ),
        )
        .toBeVisible();
      await expect
        .element(screen.getByRole("button", { name: "Cobro no habilitado" }))
        .toBeDisabled();
      await expect.element(screen.getByRole("button", { name: "Cobrar" })).not.toBeInTheDocument();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("says the register has no threshold yet and keeps Cobrar disabled", async () => {
      const { screen } = await renderScreen({
        currentSale: async () => ({
          ...SALE_OF_YERBA,
          charge_refusal: { kind: "no_buyer_identification_threshold" },
        }),
      });

      const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
      await expect.element(panel.getByText("Falta el tope de venta")).toBeVisible();
      await expect
        .element(
          panel.getByText(
            "La caja todavía no recibió el tope de venta sin identificar al comprador. Esperá a que se sincronice para poder cobrar.",
          ),
        )
        .toBeVisible();
      await expect
        .element(screen.getByRole("button", { name: "Cobro no habilitado" }))
        .toBeDisabled();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("shows no notice and keeps Cobrar when the core does not refuse the charge", async () => {
      const { screen } = await renderScreen({ currentSale: async () => SALE_OF_YERBA });

      await expect.element(screen.getByRole("button", { name: "Cobrar" })).toBeEnabled();
      await expect.element(screen.getByText("Llegaste al tope de venta")).not.toBeInTheDocument();
      await expect.element(screen.getByText("Falta el tope de venta")).not.toBeInTheDocument();
    });

    it("enables Cobrar once a product is scanned into the sale", async () => {
      const { screen, field } = await renderScreen({
        scanProduct: async () => ({ kind: "added", sale: SALE_OF_YERBA }),
      });

      await scan(field, "7790001");

      await expect.element(screen.getByRole("button", { name: "Cobrar" })).toBeEnabled();
    });

    it("goes to the charge screen from Cobrar", async () => {
      const { screen } = await renderScreen({ currentSale: async () => SALE_OF_YERBA });

      await userEvent.click(screen.getByRole("button", { name: "Cobrar" }));

      await expect.poll(() => screen.router.state.location.pathname).toBe("/charge");
    });

    it("offers to try again when it cannot be read, and shows the sale once it can", async () => {
      const currentSale = vi
        .fn<SaleScreenProps["currentSale"]>()
        .mockRejectedValueOnce(new Error("unavailable"))
        .mockResolvedValueOnce(SALE_OF_YERBA);
      const { screen } = await renderScreen({ currentSale });

      await expect.element(screen.getByText("No se pudo cargar la venta")).toBeVisible();
      await expectNoAccessibilityViolations(screen.container);
      await screen.getByRole("button", { name: "Reintentar" }).click();

      await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
      await expect.element(screen.getByText("No se pudo cargar la venta")).not.toBeInTheDocument();
      expect(currentSale).toHaveBeenCalledTimes(2);
    });

    it("keeps a sale a scan already returned when the slower first read answers afterwards", async () => {
      const read = deferred<OpenSale | null>();
      const scanProduct = vi.fn(
        async (): Promise<ScanProductOutcome> => ({ kind: "added", sale: SALE_OF_YERBA }),
      );
      const { screen, field } = await renderScreen({
        currentSale: () => read.promise,
        scanProduct,
      });

      await scan(field, "7790001");
      await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
      read.resolve(null);

      await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
      await expect.element(screen.getByText("La venta está vacía")).not.toBeInTheDocument();
    });
  });

  describe("scanning", () => {
    it("sends the code, without the blanks around it, for the person selling", async () => {
      const scanProduct = vi.fn(
        async (): Promise<ScanProductOutcome> => ({ kind: "unknown_code" }),
      );
      const { field } = await renderScreen({ scanProduct });

      await scan(field, "  7790001  ");

      await expect.poll(() => scanProduct.mock.calls).toEqual([["7790001"]]);
    });

    it("does nothing on Enter while the field is blank", async () => {
      const scanProduct = vi.fn(
        async (): Promise<ScanProductOutcome> => ({ kind: "unknown_code" }),
      );
      const { field } = await renderScreen({ scanProduct });

      await scan(field, "   ");
      await userEvent.keyboard("{Enter}");

      expect(scanProduct).not.toHaveBeenCalled();
    });

    it("shows the sale it returns, marks the line that changed and clears the field", async () => {
      const scanProduct = vi
        .fn<SaleScreenProps["scanProduct"]>()
        .mockResolvedValueOnce({ kind: "added", sale: SALE_OF_YERBA })
        .mockResolvedValueOnce({ kind: "added", sale: SALE_OF_YERBA_AND_ALFAJOR });
      const { screen, field } = await renderScreen({ scanProduct });
      const lines = screen.getByRole("listitem");

      await scan(field, "7790001");

      await expect.element(lines).toHaveLength(1);
      await expect.element(lines.first()).toHaveAttribute("aria-current", "true");
      await expect.element(field).toHaveValue("");
      await expect.element(field).toHaveFocus();

      await scan(field, "7790002");

      await expect.element(lines).toHaveLength(2);
      await expect.element(lines.first()).not.toHaveAttribute("aria-current");
      await expect.element(lines.last()).toHaveAttribute("aria-current", "true");
      await expect
        .element(
          screen
            .getByRole("complementary", { name: "Panel de cobro" })
            .getByText("$ 6.260,00")
            .first(),
        )
        .toBeVisible();
    });

    it("clears the field when the code had blanks around it", async () => {
      const { field } = await renderScreen({
        scanProduct: async () => ({ kind: "added", sale: SALE_OF_YERBA }),
      });

      await scan(field, "7790001 ");

      await expect.element(field).toHaveValue("");
    });

    it("marks the line whose quantity went up when the same product is scanned again", async () => {
      const again: OpenSale = {
        id: "sale-1",
        lines: [YERBA, { ...ALFAJOR, quantity: 2, line_total: 300_000 }],
        total: 776_000,
        charge_refusal: null,
      };
      const scanProduct = vi.fn(
        async (): Promise<ScanProductOutcome> => ({ kind: "added", sale: again }),
      );
      const { screen, field } = await renderScreen({
        currentSale: async () => SALE_OF_YERBA_AND_ALFAJOR,
        scanProduct,
      });
      await expect.element(screen.getByText("Alfajor triple")).toBeVisible();

      await scan(field, "7790002");

      const lines = screen.getByRole("listitem");
      await expect.element(lines.last()).toHaveAttribute("aria-current", "true");
      await expect.element(lines.first()).not.toHaveAttribute("aria-current");
    });

    it("leaves what is being typed alone when the scanner already started the next code", async () => {
      const answer = deferred<ScanProductOutcome>();
      const { screen, field } = await renderScreen({ scanProduct: () => answer.promise });

      await scan(field, "7790001");
      await field.fill("77900");
      answer.resolve({ kind: "added", sale: SALE_OF_YERBA });

      await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
      await expect.element(field).toHaveValue("77900");
    });

    it("sends the whole next code when the previous one is refused while the scanner types it", async () => {
      const answer = deferred<ScanProductOutcome>();
      const scanProduct = vi
        .fn<SaleScreenProps["scanProduct"]>()
        .mockReturnValueOnce(answer.promise)
        .mockResolvedValueOnce({ kind: "added", sale: SALE_OF_YERBA });
      const { screen, field } = await renderScreen({ scanProduct });

      await scan(field, "7790009");
      await field.fill("77900");
      answer.resolve({ kind: "unknown_code" });
      await answer.promise;
      await userEvent.keyboard("01{Enter}");

      await expect.poll(() => scanProduct.mock.calls).toEqual([["7790009"], ["7790001"]]);
      await expect
        .element(screen.getByText("No hay ningún producto con ese código"))
        .not.toBeInTheDocument();
    });

    it.each<{
      name: string;
      outcome: ScanProductOutcome;
      title: string;
      help: string;
    }>([
      {
        name: "an unknown code",
        outcome: { kind: "unknown_code" },
        title: "No hay ningún producto con ese código",
        help: "Buscalo por nombre. Si no aparece, falta darlo de alta en el backoffice.",
      },
      {
        name: "a product without a price",
        outcome: { kind: "no_price", product_name: "Yerba mate 1 kg" },
        title: "Yerba mate 1 kg no tiene precio",
        help: "No se puede vender hasta que alguien con el permiso de precios se lo ponga en el backoffice.",
      },
      {
        name: "a product sold by weight",
        outcome: { kind: "sold_by_weight", product_name: "Queso cremoso" },
        title: "Queso cremoso se vende por kilo",
        help: "Esta caja todavía no vende productos por kilo.",
      },
      {
        name: "a revoked installation",
        outcome: { kind: "installation_revoked" },
        title: "Esta caja ya no puede empezar ventas",
        help: "Su instalación fue reemplazada o retirada desde el backoffice.",
      },
      {
        name: "the core being unable to add it",
        outcome: { kind: "unavailable" },
        title: "No se pudo agregar el producto",
        help: "Probá escanearlo de nuevo.",
      },
      {
        name: "a person who may not sell",
        outcome: { kind: "not_permitted" },
        title: NOT_PERMITTED_TITLE,
        help: NOT_PERMITTED_HELP,
      },
    ])(
      "tells what happened, keeps the code and leaves the sale alone on $name",
      async ({ outcome, title, help }) => {
        const { screen, field } = await renderScreen({
          currentSale: async () => SALE_OF_YERBA,
          scanProduct: async () => outcome,
        });
        await expect.element(screen.getByText("Yerba mate 1 kg").first()).toBeVisible();

        await scan(field, "7790009");

        await expect.element(screen.getByText(title, { exact: true })).toBeVisible();
        await expect.element(screen.getByText(help, { exact: true })).toBeVisible();
        await expect.element(field).toHaveValue("7790009");
        await expect.element(screen.getByRole("listitem")).toHaveLength(1);
        await expect
          .element(
            screen.getByRole("complementary", { name: "Panel de cobro" }).getByText("1 línea"),
          )
          .toBeVisible();
        await expectNoAccessibilityViolations(screen.container);
      },
    );

    it.each<ScanProductOutcome>([
      { kind: "unknown_code" },
      { kind: "no_price", product_name: "Yerba mate 1 kg" },
      { kind: "sold_by_weight", product_name: "Queso cremoso" },
      { kind: "installation_revoked" },
      { kind: "unavailable" },
      { kind: "not_permitted" },
    ])("has the next code the scanner types replace one refused as $kind", async (outcome) => {
      const scanProduct = vi
        .fn<SaleScreenProps["scanProduct"]>()
        .mockResolvedValueOnce(outcome)
        .mockResolvedValueOnce({ kind: "added", sale: SALE_OF_YERBA });
      const { screen, field } = await renderScreen({ scanProduct });
      await expect.element(field).toHaveFocus();

      await userEvent.keyboard("7790009{Enter}");
      await expect.element(screen.getByRole("status").getByRole("paragraph").first()).toBeVisible();
      await expect.element(field).toHaveValue("7790009");
      await userEvent.keyboard("7790001{Enter}");

      await expect.poll(() => scanProduct.mock.calls).toEqual([["7790009"], ["7790001"]]);
    });

    it("sends a code longer than any barcode to the core and shows that no product has it", async () => {
      const tooLong = "7".repeat(65);
      const scanProduct = vi.fn(
        async (): Promise<ScanProductOutcome> => ({ kind: "unknown_code" }),
      );
      const { screen, field } = await renderScreen({ scanProduct });

      await scan(field, tooLong);

      await expect.element(screen.getByText("No hay ningún producto con ese código")).toBeVisible();
      await expect
        .element(
          screen.getByText(
            "Buscalo por nombre. Si no aparece, falta darlo de alta en el backoffice.",
          ),
        )
        .toBeVisible();
      await expect.element(field).toHaveValue(tooLong);
      expect(scanProduct).toHaveBeenCalledExactlyOnceWith(tooLong);
    });

    it("tells that the product could not be added when the core doesn't answer", async () => {
      const { screen, field } = await renderScreen({
        scanProduct: async () => {
          throw new Error("the core connection was replaced");
        },
      });

      await scan(field, "7790009");

      await expect.element(screen.getByText("No se pudo agregar el producto")).toBeVisible();
      await expect.element(field).toHaveValue("7790009");
    });

    it("announces what happened without moving the lines", async () => {
      const { screen, field } = await renderScreen({
        currentSale: async () => SALE_OF_YERBA,
        scanProduct: async () => ({ kind: "unknown_code" }),
      });
      const line = screen.getByRole("listitem").first();
      await expect.element(line).toBeVisible();
      const before = line.element().getBoundingClientRect().top;

      await scan(field, "7790009");

      const message = screen.getByRole("status").filter({
        hasText: "No hay ningún producto con ese código",
      });
      await expect.element(message).toBeInTheDocument();
      expect(line.element().getBoundingClientRect().top).toBe(before);
      const fieldBox = field.element().getBoundingClientRect();
      const messageBox = screen
        .getByText("No hay ningún producto con ese código")
        .element()
        .getBoundingClientRect();
      expect(messageBox.top).toBeGreaterThanOrEqual(fieldBox.bottom);
    });

    it("takes the message away when the text in the field changes", async () => {
      const { screen, field } = await renderScreen();
      await scan(field, "7790009");
      await expect.element(screen.getByText("No hay ningún producto con ese código")).toBeVisible();

      await field.fill("77900091");

      await expect
        .element(screen.getByText("No hay ningún producto con ese código"))
        .not.toBeInTheDocument();
    });

    it("takes the message away on the next successful scan", async () => {
      const scanProduct = vi
        .fn<SaleScreenProps["scanProduct"]>()
        .mockResolvedValueOnce({ kind: "unknown_code" })
        .mockResolvedValueOnce({ kind: "added", sale: SALE_OF_YERBA });
      const { screen, field } = await renderScreen({ scanProduct });
      await scan(field, "7790009");
      await expect.element(screen.getByText("No hay ningún producto con ese código")).toBeVisible();

      await userEvent.keyboard("{Enter}");

      await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
      await expect
        .element(screen.getByText("No hay ningún producto con ese código"))
        .not.toBeInTheDocument();
    });

    it("leaves the session alone when a scan is refused because the person may not sell", async () => {
      const onSessionInvalid = vi.fn();
      const { screen, field } = await renderScreen({
        scanProduct: async () => ({ kind: "not_permitted" }),
        onSessionInvalid,
      });

      await scan(field, "7790009");

      await expect.element(screen.getByText(NOT_PERMITTED_TITLE)).toBeVisible();
      expect(onSessionInvalid).not.toHaveBeenCalled();
    });

    it("says only once that the person may not sell when a scan is refused for it too", async () => {
      const { screen, field } = await renderScreen({
        currentSale: async () => "not_permitted",
        scanProduct: async () => ({ kind: "not_permitted" }),
      });
      await expect.element(screen.getByText(NOT_PERMITTED_TITLE)).toBeVisible();

      await scan(field, "7790009");

      const input = field.element() as HTMLInputElement;
      await expect
        .poll(() => [input.selectionStart, input.selectionEnd])
        .toEqual([0, "7790009".length]);
      await expect.element(screen.getByText(NOT_PERMITTED_TITLE)).toHaveLength(1);
      await expect.element(screen.getByText(NOT_PERMITTED_HELP)).toHaveLength(1);
    });

    it.each<ScanProductOutcome>([{ kind: "not_signed_in" }, { kind: "no_open_session" }])(
      "asks for the session to be read again when the core answers $kind, without any message",
      async (outcome) => {
        const onSessionInvalid = vi.fn();
        const { screen, field } = await renderScreen({
          scanProduct: async () => outcome,
          onSessionInvalid,
        });

        await scan(field, "7790009");

        await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
        await expect
          .element(screen.getByText("No hay ningún producto con ese código"))
          .not.toBeInTheDocument();
        await expect
          .element(screen.getByText("No se pudo agregar el producto"))
          .not.toBeInTheDocument();
      },
    );
  });
});
