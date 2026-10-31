import type { ChargeSaleWithPaidOrderOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  chooseCash,
  readsInTurn,
  renderScreen,
  SALE_OF_ONE_LINE,
  saleRebuiltAgainstPaidOrder,
} from "./test-support/charge-screen";

const APPLY = "Cobrar con el pago de Mercado Pago";
const QR_ORDER = { method: "QR", amount: 500_000 } as const;

describe("ChargeScreen · pago de Mercado Pago de una venta armada", () => {
  it("shows the QR paid order of the rebuilt sale with its amount and offers applying it", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => saleRebuiltAgainstPaidOrder(QR_ORDER),
    });

    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Pago con QR de Mercado Pago de $ 5.000,00");
    await expect.element(screen.getByRole("button", { name: APPLY })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("names a Point paid order as Point", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => saleRebuiltAgainstPaidOrder({ method: "POINT", amount: 500_000 }),
    });

    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Pago con Point de $ 5.000,00");
  });

  it.each([
    ["a sale not rebuilt against a paid order", SALE_OF_ONE_LINE],
    ["a paid order already applied", saleRebuiltAgainstPaidOrder({ ...QR_ORDER, applied: true })],
  ])("offers nothing for %s", async (_case, sale) => {
    const { screen } = await renderScreen({ currentSale: async () => sale });

    await expect
      .element(screen.getByRole("heading", { name: "Elegí el medio de pago" }))
      .toBeVisible();
    await expect.element(screen.getByRole("button", { name: APPLY })).not.toBeInTheDocument();
  });

  it("applies the order through the core once, even pressed twice, and shows the completed sale", async () => {
    const { screen, chargeSaleWithPaidOrder } = await renderScreen({
      currentSale: async () => saleRebuiltAgainstPaidOrder(QR_ORDER),
    });
    const apply = screen.getByRole("button", { name: APPLY });
    await expect.element(apply).toBeVisible();
    const element = apply.element() as HTMLElement;

    element.click();
    element.click();

    await expect.element(screen.getByText("VENTA COMPLETADA")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "No hay vuelto para entregar" }))
      .toBeVisible();
    await expect.element(screen.getByText("QR de Mercado Pago", { exact: true })).toBeVisible();
    expect(chargeSaleWithPaidOrder).toHaveBeenCalledExactlyOnceWith("sale-1");
  });

  it("tells the surplus goes back to the customer through Mercado Pago, with no change handed out", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => saleRebuiltAgainstPaidOrder(QR_ORDER),
      chargeSaleWithPaidOrder: async () => ({
        kind: "completed",
        sale_id: "sale-1",
        total: 476_000,
        applied: 500_000,
        surplus: 24_000,
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: APPLY }));

    await expect.element(screen.getByText("VENTA COMPLETADA")).toBeVisible();
    await expect
      .element(screen.getByRole("dialog").getByRole("status"))
      .toHaveTextContent(
        "Mercado Pago le devuelve $ 240,00 al cliente No se entrega vuelto en el mostrador.",
      );
  });

  it("goes back to the methods showing what is left to charge after the order paid part of the sale", async () => {
    const { screen, currentSale } = await renderScreen({
      currentSale: readsInTurn(
        saleRebuiltAgainstPaidOrder(QR_ORDER, {
          ...SALE_OF_ONE_LINE,
          total: 900_000,
          pending: 900_000,
        }),
        {
          ...saleRebuiltAgainstPaidOrder(
            { ...QR_ORDER, applied: true },
            { ...SALE_OF_ONE_LINE, total: 900_000, paid: 500_000, pending: 400_000 },
          ),
        },
      ),
      chargeSaleWithPaidOrder: async () => ({
        kind: "partially_paid",
        sale_id: "sale-1",
        total: 900_000,
        paid: 500_000,
        pending: 400_000,
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: APPLY }));

    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Quedan $ 4.000,00 por cobrar con otro medio");
    await expect.element(screen.getByRole("button", { name: APPLY })).not.toBeInTheDocument();
    await expect.element(screen.getByText("VENTA COMPLETADA")).not.toBeInTheDocument();
    const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
    await expect.element(panel.getByText("$ 5.000,00")).toBeVisible();
    expect(currentSale.mock.calls.length).toBeGreaterThan(1);
  });

  it("reads the sale again when the core says it has no paid order to apply or it was already applied", async () => {
    const { screen, currentSale } = await renderScreen({
      currentSale: readsInTurn(saleRebuiltAgainstPaidOrder(QR_ORDER), SALE_OF_ONE_LINE),
      chargeSaleWithPaidOrder: async () => ({ kind: "already_applied" }),
    });

    await userEvent.click(screen.getByRole("button", { name: APPLY }));

    await expect.element(screen.getByRole("button", { name: APPLY })).not.toBeInTheDocument();
    expect(currentSale.mock.calls.length).toBeGreaterThan(1);
  });

  it("says the sale could not be charged with the order when the core is unavailable, and lets try again", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => saleRebuiltAgainstPaidOrder(QR_ORDER),
      chargeSaleWithPaidOrder: async () => ({ kind: "unavailable" }),
    });

    await userEvent.click(screen.getByRole("button", { name: APPLY }));

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No se pudo cobrar con el pago de Mercado Pago. Probá de nuevo.");
    await expect.element(screen.getByRole("button", { name: APPLY })).toBeEnabled();
  });

  it("treats a failed request as the core being unavailable", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => saleRebuiltAgainstPaidOrder(QR_ORDER),
      chargeSaleWithPaidOrder: () => Promise.reject(new Error("the core connection was replaced")),
    });

    await userEvent.click(screen.getByRole("button", { name: APPLY }));

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No se pudo cobrar con el pago de Mercado Pago. Probá de nuevo.");
  });

  it("says the register is being restored", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => saleRebuiltAgainstPaidOrder(QR_ORDER),
      chargeSaleWithPaidOrder: async () => ({ kind: "restoration_in_progress" }),
    });

    await userEvent.click(screen.getByRole("button", { name: APPLY }));

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("La caja se está restaurando. Esperá a que termine.");
  });

  it.each([
    { kind: "empty_sale" },
    { kind: "zero_total" },
    { kind: "no_open_sale" },
    { kind: "not_permitted" },
    { kind: "reaches_buyer_identification_threshold", threshold: 476_000 },
    { kind: "no_buyer_identification_threshold" },
  ] as const satisfies ChargeSaleWithPaidOrderOutcome[])(
    "goes back to the sale when the core answers %j",
    async (outcome) => {
      const { screen } = await renderScreen({
        currentSale: async () => saleRebuiltAgainstPaidOrder(QR_ORDER),
        chargeSaleWithPaidOrder: async () => outcome,
      });

      await userEvent.click(screen.getByRole("button", { name: APPLY }));

      await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
    },
  );

  it.each(["not_signed_in", "no_open_session"] as const)(
    "reports an invalid session when the core answers %s",
    async (kind) => {
      const { screen, onSessionInvalid } = await renderScreen({
        currentSale: async () => saleRebuiltAgainstPaidOrder(QR_ORDER),
        chargeSaleWithPaidOrder: async () => ({ kind }),
      });

      await userEvent.click(screen.getByRole("button", { name: APPLY }));

      await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
    },
  );

  it("leaves the other methods to the core, which refuses them until the order is applied", async () => {
    const { screen, chargeSaleInCash } = await renderScreen({
      currentSale: async () => saleRebuiltAgainstPaidOrder(QR_ORDER),
      chargeSaleInCash: async () => ({ kind: "paid_order_not_applied" }),
    });

    await chooseCash(screen);
    await userEvent.fill(
      screen.getByRole("textbox", { name: "Importe entregado por el cliente" }),
      "5.000,00",
    );
    await userEvent.click(screen.getByRole("button", { name: "Completar venta" }));

    expect(chargeSaleInCash).toHaveBeenCalledOnce();
    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Aplicá primero el pago de Mercado Pago de esta venta.");
  });
});
