import type { CancelLockedSaleOutcome, SessionOpenSale } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { RefusedClose } from "./close-cash-session-panel";
import type { CancelSale, LoadOpenSale } from "./test-support/locked-cash-count";
import {
  CANCELLABLE_SALE,
  closeWith,
  deferred,
  OPEN_SALE_NOTICE,
  PART_PAID_SALE,
  renderStep,
  withOpenSale,
} from "./test-support/locked-cash-count";

const EMPTY_FAILED_NOTICE = "No se pudo vaciar el carrito. Probá de nuevo.";
const CANCEL_FAILED_NOTICE = "No se pudo cancelar la venta. Probá de nuevo.";
const QR_WAIT_BEFORE_EMPTYING =
  "Hay un cobro con Mercado Pago en curso. Esperá a que termine para vaciar el carrito.";
const QR_WAIT_BEFORE_CANCELLING =
  "Hay un cobro con Mercado Pago en curso. Esperá a que termine para cancelar la venta.";
const SALE_IN_A_QR_WAIT: SessionOpenSale = {
  ...CANCELLABLE_SALE,
  cancellable: false,
  cancel_refusal: "mercado_pago_charge_in_progress",
};
const PAID_SALE_IN_A_QR_WAIT: SessionOpenSale = {
  ...PART_PAID_SALE,
  cancel_refusal: "mercado_pago_charge_in_progress",
};

const emptyCart = (screen: Awaited<ReturnType<typeof renderStep>>["screen"]) =>
  screen.getByRole("button", { name: "Vaciar carrito" });

describe("LockedCashCount banner of the open sale", () => {
  it("offers to empty the cart of a sale with no payments, with V, keeping Cerrar caja disabled", async () => {
    const { screen, close } = await withOpenSale();

    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
    await expect.element(screen.getByText("Vaciá el carrito para cerrar la caja.")).toBeVisible();
    await expect.element(emptyCart(screen).first()).toHaveTextContent("Vaciar carritoV");
    await expect.element(screen.getByRole("button", { name: "Cerrar caja" })).toBeDisabled();
    expect(close).not.toHaveBeenCalled();
  });

  it("offers to cancel a sale with payments, with V", async () => {
    const { screen } = await renderStep({ loadOpenSale: async () => PART_PAID_SALE });

    await expect.element(screen.getByText("Cancelala para cerrar la caja.")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Cancelar la venta" }))
      .toHaveTextContent("Cancelar la ventaV");
  });

  it("keeps the banner while the count is typed", async () => {
    const { screen } = await withOpenSale();
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();

    await userEvent.fill(screen.getByRole("textbox", { name: "Contado" }), "45800,00");

    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
  });

  it.each<[string, SessionOpenSale]>([
    ["no payments", CANCELLABLE_SALE],
    ["payments", PART_PAID_SALE],
  ])(
    "goes back to the locked register with Esc while a sale with %s is open, without closing",
    async (_case, sale) => {
      const { screen, close } = await renderStep({ loadOpenSale: async () => sale });
      await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();

      await userEvent.keyboard("{Escape}");

      await vi.waitFor(() => expect(screen.router.state.location.pathname).toBe("/locked"));
      expect(close).not.toHaveBeenCalled();
    },
  );

  it.each<[string, SessionOpenSale, string]>([
    ["emptying the cart", CANCELLABLE_SALE, "¿Vaciar el carrito?"],
    ["cancelling the sale", PART_PAID_SALE, "¿Cancelar la venta?"],
  ])(
    "keeps the typed count once the panel for %s goes back with Esc",
    async (_case, sale, panel) => {
      const { screen } = await renderStep({ loadOpenSale: async () => sale });
      await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
      await userEvent.fill(screen.getByRole("textbox", { name: "Contado" }), "45800,00");

      await userEvent.keyboard("v");
      await expect.element(screen.getByRole("complementary", { name: panel })).toBeVisible();
      await userEvent.keyboard("{Escape}");

      await expect
        .element(screen.getByRole("textbox", { name: "Contado" }))
        .toHaveValue("45.800,00");
    },
  );

  it("shows a placeholder while the open sale is read", async () => {
    const { screen } = await renderStep({ loadOpenSale: () => new Promise(() => {}) });

    await expect.element(screen.getByRole("main").getByText("Cargando…")).toBeInTheDocument();
  });
});

describe("LockedCashCount emptying the cart of a sale with no payments", () => {
  it("opens the panel with the button and with V, saying how many lines the cart holds, with no rail", async () => {
    const { screen, cancelSale } = await withOpenSale();

    await userEvent.keyboard("v");

    const panel = screen.getByRole("complementary", { name: "¿Vaciar el carrito?" });
    await expect.element(panel).toBeVisible();
    await expect.element(panel.getByText("VENTA ABIERTA · SIN PAGOS")).toBeVisible();
    await expect.element(panel.getByText("$ 25.192,50", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("Líneas en el carrito")).toBeVisible();
    await expect.element(panel.getByText("4", { exact: true })).toBeVisible();
    await expect.element(screen.getByRole("navigation")).not.toBeInTheDocument();
    expect(cancelSale).not.toHaveBeenCalled();
  });

  it("goes back to the close panel with Esc, keeping the open sale", async () => {
    const { screen, cancelSale } = await withOpenSale();
    await userEvent.keyboard("v");
    await expect.element(emptyCart(screen).last()).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByRole("complementary", { name: "Cerrar caja" })).toBeVisible();
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
    expect(screen.router.state.location.pathname).toBe("/");
    expect(cancelSale).not.toHaveBeenCalled();
  });

  it("clears the banner once the cart is emptied, with Enter, and lets the closer close the register", async () => {
    const { screen, close, cancelSale } = await withOpenSale();
    await userEvent.keyboard("v");
    await expect.element(emptyCart(screen).last()).toBeVisible();

    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).not.toBeInTheDocument();
    expect(cancelSale).toHaveBeenCalledWith("sale-1");
    await closeWith(screen, "45800,00");
    await expect.poll(() => close).toHaveBeenCalledWith(4_580_000);
  });

  it("disables the screen's buttons while the cart is being emptied", async () => {
    const pending = deferred<CancelLockedSaleOutcome>();
    const { screen } = await withOpenSale({ cancelSale: () => pending.promise });
    await userEvent.keyboard("v");

    await emptyCart(screen).last().click();

    await expect.element(screen.getByRole("button", { name: "Cerrar con Esc" })).toBeDisabled();
    pending.resolve({ kind: "cancelled", refunds: [] });
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "Cerrar caja" })).toBeEnabled();
  });

  it("clears the banner when the core finds no sale left to cancel", async () => {
    const { screen } = await withOpenSale({ cancelSale: async () => ({ kind: "no_open_sale" }) });
    await userEvent.keyboard("v");

    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).not.toBeInTheDocument();
  });

  it("keeps the open sale and says why when a QR charge is still waiting", async () => {
    const { screen, refused } = await withOpenSale({
      cancelSale: async () => ({ kind: "mercado_pago_charge_in_progress" }),
    });
    await userEvent.keyboard("v");

    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByText(QR_WAIT_BEFORE_EMPTYING).first()).toBeVisible();
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
    expect(refused).toEqual([]);
  });

  it.each<[string, CancelSale]>([
    ["the core is unavailable", async () => ({ kind: "unavailable" })],
    ["the restoration is in progress", async () => ({ kind: "restoration_in_progress" })],
    ["the request fails", () => Promise.reject(new Error("the core connection was replaced"))],
  ])("says the cart could not be emptied when %s, keeping the open sale", async (_case, cancel) => {
    const { screen } = await withOpenSale({ cancelSale: cancel });
    await userEvent.keyboard("v");

    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByText(EMPTY_FAILED_NOTICE).first()).toBeVisible();
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
  });

  it.each<CancelLockedSaleOutcome>([{ kind: "cancelled", refunds: [] }, { kind: "not_permitted" }])(
    "drops the earlier failure once the cart is asked to be emptied again and the core answers $kind",
    async (outcome) => {
      const cancelSale = vi
        .fn<CancelSale>()
        .mockResolvedValueOnce({ kind: "unavailable" })
        .mockResolvedValueOnce(outcome);
      const { screen } = await withOpenSale({ cancelSale });
      await userEvent.keyboard("v");
      await userEvent.keyboard("{Enter}");
      await expect.element(screen.getByText(EMPTY_FAILED_NOTICE).first()).toBeVisible();

      await userEvent.keyboard("v");
      await userEvent.keyboard("{Enter}");

      await expect.poll(() => cancelSale.mock.calls.length).toBe(2);
      await expect.element(screen.getByText(EMPTY_FAILED_NOTICE).first()).not.toBeInTheDocument();
    },
  );

  it.each<RefusedClose>([
    { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 4 },
    { kind: "rate_limited", retry_after_seconds: 5, attempts_left: 4 },
    { kind: "locked", consecutive_failures: 8 },
    { kind: "lacks_permission" },
    { kind: "not_locked" },
  ])(
    "hands a refused closer back when the core answers $kind to emptying the cart",
    async (refusal) => {
      const { screen, refused } = await withOpenSale({ cancelSale: async () => refusal });
      await userEvent.keyboard("v");

      await userEvent.keyboard("{Enter}");

      await expect.poll(() => refused).toEqual([refusal]);
      await expect.element(screen.getByText(EMPTY_FAILED_NOTICE).first()).not.toBeInTheDocument();
    },
  );

  it("opens the panel with the action disabled, saying to wait, while a QR charge is in progress", async () => {
    const loadOpenSale = vi.fn<LoadOpenSale>(async () => SALE_IN_A_QR_WAIT);
    const { screen, cancelSale } = await renderStep({ loadOpenSale });
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();

    await userEvent.keyboard("v");

    const panel = screen.getByRole("complementary", { name: "¿Vaciar el carrito?" });
    await expect.element(panel.getByRole("alert")).toHaveTextContent(QR_WAIT_BEFORE_EMPTYING);
    await expect.element(panel.getByRole("button", { name: "Vaciar carrito" })).toBeDisabled();
    await userEvent.keyboard("{Enter}");
    expect(cancelSale).not.toHaveBeenCalled();
    expect(loadOpenSale).toHaveBeenCalledTimes(2);
  });

  it("asks the core before refusing, and offers to empty the cart when it no longer refuses", async () => {
    const loadOpenSale = vi
      .fn<LoadOpenSale>()
      .mockResolvedValueOnce(SALE_IN_A_QR_WAIT)
      .mockResolvedValue(CANCELLABLE_SALE);
    const { screen } = await renderStep({ loadOpenSale });
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();

    await userEvent.keyboard("v");

    const panel = screen.getByRole("complementary", { name: "¿Vaciar el carrito?" });
    await expect.element(panel.getByRole("button", { name: "Vaciar carrito" })).toBeEnabled();
    await expect.element(panel.getByRole("alert")).not.toBeInTheDocument();
  });

  it("says the cart could not be emptied when the core cannot answer whether it still refuses", async () => {
    const loadOpenSale = vi
      .fn<LoadOpenSale>()
      .mockResolvedValueOnce(SALE_IN_A_QR_WAIT)
      .mockResolvedValue("unavailable");
    const { screen, cancelSale } = await renderStep({ loadOpenSale });
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();

    await userEvent.keyboard("v");

    await expect.element(screen.getByText(EMPTY_FAILED_NOTICE).first()).toBeVisible();
    await expect
      .element(screen.getByRole("complementary", { name: "¿Vaciar el carrito?" }))
      .not.toBeInTheDocument();
    expect(cancelSale).not.toHaveBeenCalled();
  });
});

describe("LockedCashCount cancelling a sale with payments", () => {
  it("opens the panel with the button and with V, asking first what would be refunded", async () => {
    const { screen, cancelSale } = await renderStep({ loadOpenSale: async () => PART_PAID_SALE });
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();

    await userEvent.keyboard("v");

    const panel = screen.getByRole("complementary", { name: "¿Cancelar la venta?" });
    await expect.element(panel.getByText("VENTA EN CURSO · CON PAGOS")).toBeVisible();
    await expect.element(panel.getByText("Efectivo · en el acto")).toBeVisible();
    await expect.element(panel.getByText("QR · reembolso pendiente")).toBeVisible();
    await expect.element(screen.getByRole("navigation")).not.toBeInTheDocument();
    expect(cancelSale).not.toHaveBeenCalled();
  });

  it("goes back to the close panel with Esc", async () => {
    const { screen } = await renderStep({ loadOpenSale: async () => PART_PAID_SALE });
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
    await userEvent.keyboard("v");
    await expect
      .element(screen.getByRole("complementary", { name: "¿Cancelar la venta?" }))
      .toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByRole("complementary", { name: "Cerrar caja" })).toBeVisible();
    expect(screen.router.state.location.pathname).toBe("/");
  });

  it("clears the banner and shows the refunds to give back once the sale is cancelled, then lets the closer close the register", async () => {
    const cancelSale = vi.fn<CancelSale>(async () => ({
      kind: "cancelled",
      refunds: PART_PAID_SALE.refunds_on_cancel,
    }));
    const { screen, close } = await renderStep({
      cancelSale,
      loadOpenSale: async () => PART_PAID_SALE,
    });
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
    await userEvent.keyboard("v");

    await userEvent.keyboard("{Enter}");

    const cancelled = screen.getByRole("dialog", { name: "Venta cancelada" });
    await expect.element(cancelled.getByText("Devolver $ 5.000,00 en efectivo")).toBeVisible();
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).not.toBeInTheDocument();
    expect(cancelSale).toHaveBeenCalledWith(PART_PAID_SALE.id);
    await cancelled.getByRole("button", { name: "Listo" }).click();
    await closeWith(screen, "45800,00");
    await expect.poll(() => close).toHaveBeenCalledWith(4_580_000);
  });

  it("keeps the sale when the closer may not cancel it", async () => {
    const { screen, cancelSale } = await renderStep({
      cancelSale: vi.fn<CancelSale>(async () => ({ kind: "not_permitted" })),
      loadOpenSale: async () => PART_PAID_SALE,
    });
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
    await userEvent.keyboard("v");

    await userEvent.keyboard("{Enter}");

    await expect.poll(() => cancelSale).toHaveBeenCalledWith(PART_PAID_SALE.id);
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
  });

  it("clears the banner when the core finds no sale left to cancel", async () => {
    const { screen } = await renderStep({
      cancelSale: async () => ({ kind: "no_open_sale" }),
      loadOpenSale: async () => PART_PAID_SALE,
    });
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
    await userEvent.keyboard("v");

    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).not.toBeInTheDocument();
  });

  it("sends the closer back to identification when the core refuses their authorization", async () => {
    const refusal: CancelLockedSaleOutcome = { kind: "not_locked" };
    const { screen, refused } = await renderStep({
      cancelSale: async () => refusal,
      loadOpenSale: async () => PART_PAID_SALE,
    });
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
    await userEvent.keyboard("v");

    await userEvent.keyboard("{Enter}");

    await expect.poll(() => refused).toEqual([refusal]);
  });

  it("opens the panel with only what was paid, a notice to wait and the action disabled, while a charge is in progress", async () => {
    const { screen, cancelSale } = await renderStep({
      loadOpenSale: async () => PAID_SALE_IN_A_QR_WAIT,
    });
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();

    await userEvent.keyboard("v");

    const panel = screen.getByRole("complementary", { name: "¿Cancelar la venta?" });
    await expect.element(panel.getByText("Pagado", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("Efectivo · en el acto")).not.toBeInTheDocument();
    await expect.element(panel.getByRole("alert")).toHaveTextContent(QR_WAIT_BEFORE_CANCELLING);
    await expect.element(panel.getByRole("button", { name: "Cancelar la venta" })).toBeDisabled();
    await userEvent.keyboard("{Enter}");
    expect(cancelSale).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    await expect.element(screen.getByRole("complementary", { name: "Cerrar caja" })).toBeVisible();
  });

  it("says the sale could not be cancelled when the core cannot answer whether it still refuses", async () => {
    const loadOpenSale = vi
      .fn<LoadOpenSale>()
      .mockResolvedValueOnce(PAID_SALE_IN_A_QR_WAIT)
      .mockResolvedValue("unavailable");
    const { screen } = await renderStep({ loadOpenSale });
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();

    await userEvent.keyboard("v");

    await expect.element(screen.getByText(CANCEL_FAILED_NOTICE).first()).toBeVisible();
  });
});
